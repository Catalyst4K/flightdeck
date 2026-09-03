# Plan: real (keyed) SimBrief plan generation

Branch: `plan/simbrief-plan-generation`. Not one of the six 2026-09-03 plan branches —
Callum's real SimBrief API key didn't exist when those were scoped. Unrelated to the
older, already-shipped `plan/simbrief-generation` branch (flight number/departure
time/cost index on the keyless prefill URL) despite the similar name; that work is done
and merged into `main`.

## Context

Dispatch's "Plan a flight" panel already builds a fully prefilled SimBrief URL and hands
it to the user's system browser via `shell.openExternal` (`src/main/index.ts`,
`dispatchOpenSimBrief`). That's a real, working flow, but it's a context switch every
time: leave the app, generate on SimBrief's site, come back, click "Fetch latest OFP".

A real API key changes what's possible: generation can be triggered *from inside the
app*, in a window Flightdeck controls, so the moment it's done the app already knows and
can fetch it automatically — no "come back and click Fetch" step. That's the entire value
of this plan; it does not change what SimBrief itself does, and it does not remove the
existing external-browser flow, which stays as the fallback for anyone without a key
(same "keep the old system in place" approach as every other blocked-then-unblocked
feature this session).

## What's confirmed, live, before writing production code

Per CLAUDE.md's spike-first rule and the restriction on documenting SimBrief's own
developer-package mechanism anywhere in this repo (`docs/simbrief-notes.md`'s
"Generation" section has the full, safe write-up — this plan only summarizes the parts
that shape the implementation):

- **Generation still requires a real, visible, interactive browser surface** — not a
  background HTTP call. The pilot has to complete SimBrief's own login there. Confirmed
  live with `scripts/spike-simbrief-generation.ts`: an Electron `BrowserWindow` pointed at
  the real endpoint correctly showed SimBrief's login (routed through Navigraph, with
  Apple as the identity provider in Callum's case) and then completed generation once
  logged in.
- **No new retrieval path is needed.** The identifier a real generation hands back is the
  same `request_id` the existing `fetchLatestOfp` already returns from a normal fetch —
  confirmed by triggering a real generation and watching `fetchLatestOfp` pick up the new
  `request_id` once it finished. Retrieval is just "call the function that already
  exists," not new code.
- **The departure-date convention on this path is not the same as the keyless prefill
  URL's Unix epoch.** Confirmed by round-tripping a specific, deliberately-not-today test
  departure time through a real generation and checking it came back unchanged
  (`schedOutUtc`) in the fetched plan. The production code needs to build this request
  correctly for this path specifically — reusing the keyless URL's date-building helper
  (`dispatch-time.ts`) here would silently produce the wrong departure time.
- **A gotcha that looks like it needs handling but doesn't, in production.** SimBrief's
  own window closes itself once generation finishes. The *spike* had to explicitly
  override Electron's `window-all-closed` app-level default (which quits the whole
  process when the last window closes) because the spike's popup was the *only* window
  that process had. **The real app doesn't have this problem**: `src/main/index.ts`
  already has its own `window-all-closed` handler that only quits when
  `BrowserWindow.getAllWindows().length === 0`, and the main app window stays open the
  entire time the generation popup is up — so the popup closing never brings that count to
  zero. No change needed to the app's existing window-lifecycle handling; just don't
  register a second, conflicting `window-all-closed` listener.
- **Login does not persist across a process restart — confirmed live, correcting an
  earlier wrong guess.** The original spike write-up guessed the first run's re-prompt was
  just the process dying before a cookie flush completed, and that fixing that bug would
  make login "stick" between runs. A follow-up check disproved that: after a completed,
  successful generation, a **fresh navigation to simbrief.com in the same persisted
  session** showed zero cookies for that domain and a fully logged-out homepage — not a
  timing bug, but session-scoped auth that doesn't survive a restart at all. (This checked
  SimBrief's own ordinary public website, not the restricted developer package — no
  concern there.) Practical effect: within one continuous run of the app, a second
  Generate click may skip the login screen; a full app restart should assume it won't.
  Nothing to build differently for this — just don't design around "login happens once,
  ever," and see the Settings section below for why the username still has to be entered
  directly rather than derived from a login.

## Credential storage — revised 2026-09-03, recorded in `docs/decisions.md`

**Superseded the original per-user Settings design below the same day it was built.**
First shipped as a masked Settings field (`app_setting` table, same pattern as
`simbriefUsername`) — reasonable as a first cut, but wrong for how this app is actually
distributed. Re-reading the mechanism: **the API key doesn't identify who's generating a
plan — the pilot's own interactive SimBrief login in the popup does that.** The key only
authorizes a request as coming from a registered application. That's the same shape as
the original VA-website use case the SimBrief package was built for: one VA, one key,
many different pilots each logging into their own account. Flightdeck fits that shape
too — it's one freely-distributed application, not a hosted multi-tenant service, and the
email requesting the key (see `docs/decisions.md`) already disclosed the eventual public
release and got the key anyway.

So the key is **application-level, baked in at build time, not stored per-user or exposed
in Settings at all**: `MAIN_VITE_SIMBRIEF_API_KEY` (`.env.example`, loaded via
electron-vite's `MAIN_VITE_` prefix — see `src/main/vite-env.d.ts` for the `import.meta.env`
typing), read once as `simbrief-generate.ts`'s exported `BUILT_IN_API_KEY`. A real,
distributed binary means the key is technically extractable regardless (encrypting it
would just ship the decryption method alongside it — not a real protection), but that's a
materially smaller risk than the alternative of running a server to broker it, which
would be a new "introduces a server" decision in its own right (CLAUDE.md) — not needed
here since the key genuinely isn't a secret tied to any one person's identity.

The per-user Settings field, its `app_setting` row, and the three-file IPC lockstep that
backed it were all removed as soon as the built-in key replaced them — no dead
half-supported path left behind.

## Implementation

### 1. Settings: username and a Navigraph login button (no API key field)

**Auto-deriving the username from a login was tried and doesn't work** — checked live
(see above): no persistent, scrapable "logged in" state exists after a generation
completes. So the username field stays exactly as it is today (`simbriefUsername`,
manually entered, still the only thing `fetchLatestOfp`/"Fetch latest OFP" needs — that
feature is unrelated to login and isn't changing).

- **No Settings field for the API key** — it's built into the app (see Credential
  storage above), not something a user sets.
- **"Log in to Navigraph" button**, next to the username field. Opens the same kind of
  `BrowserWindow` the generation flow uses, pointed at a plain login URL (no generation
  request attached), so the pilot can authenticate ahead of time and — within that same
  app run only, per the finding above — Generate won't need to show a login screen. Purely
  a convenience; nothing else in the app depends on this having been clicked first, since
  the generation window handles its own login inline regardless.

### 2. Main process: trigger + await generation

New module, `src/main/simbrief/simbrief-generate.ts` (name TBD at implementation time) —
kept separate from `simbrief-client.ts` (which only ever does a read-only fetch) since
this one owns a `BrowserWindow` and has real side effects:

- One exported function taking the same shape of params `dispatchOpenSimBrief` already
  takes (orig/dest/type-or-airframe/airline/fltnum/departure), plus the API key and
  username read from settings.
- Builds the generation request correctly for *this* path's date convention (not
  `dispatch-time.ts`'s epoch helper — see above).
- Opens a `BrowserWindow` (owned by this module, not the main app window), navigates it to
  the generation request, and resolves once that window closes — mirroring the spike's
  now-fixed control flow, but as a scoped async function rather than a whole process's
  `main()`.
- Does **not** itself re-fetch the OFP — that's the existing `fetchLatestOfp`, called by
  the same IPC handler right after the window-closed promise resolves, or left to the
  renderer to call the existing `dispatchFetchOfp` channel. (Which of the two is simpler
  to wire correctly is worth settling during implementation, not guessing here — either
  way, no new fetch/parse logic.)
- Sanity check before treating the result as real: confirm `request_id` actually changed
  from the value observed just before opening the window. If the window closed without a
  new `request_id` (user closed it early, or login never completed), surface that as "no
  new plan was generated" rather than silently re-showing whatever the old latest plan
  was.

### 3. IPC

- New channel, e.g. `dispatchGenerateOfp`, same param shape as `dispatchOpenSimBrief`.
  Returns once the popup closes (see above) — the renderer then proceeds exactly like it
  already does after a manual "Fetch latest OFP" (reusing `handleFetch`'s existing
  matched-aircraft / airframe-capture logic in `DispatchView.tsx`, not duplicating it).

### 4. Renderer

- `DispatchView.tsx`'s "Plan a flight" panel: **"Generate…" replaces "Plan on
  SimBrief…"** as the primary button whenever generation is available (checked via
  `dispatchGenerationAvailable` on mount, which just reflects whether this build has a
  built-in key — true for any normal build). Clicking it shows a loading state until the
  IPC call resolves, then runs the same fetch-and-match flow "Fetch latest OFP" already
  runs.
- **"Plan on SimBrief…" (external browser) only reappears as a fallback** for a build
  with no key baked in — e.g. built from source with no `.env` configured — so Dispatch
  never has zero ways to create a plan. Not a user preference toggle; whichever one
  applies is chosen automatically.

## Not in this plan

- Changing anything about the keyless external-browser flow itself.
- A "Login to Navigraph" Settings flow of its own — the popup handles login as part of
  the generation window; nothing in this plan needs a separate, persistent-login concept
  beyond what Electron's default session already does.
- Any change to how `fetchLatestOfp` parses an OFP — confirmed above that nothing new is
  needed there.

## Open questions

- **Abandoned popups.** If the pilot opens the window and never finishes (closes the app,
  walks away), should the app time out and cancel rather than waiting indefinitely? Worth
  a generous timeout (the spike used 5 minutes for polling, but that was arbitrary) with a
  visible "Cancel" affordance, not silent infinite waiting.
- **A pilot manually generating something unrelated in that same window.** The
  `request_id`-changed check only proves *some* new plan appeared, not that it's the one
  Flightdeck asked for. Low-risk (the window is only open for this one purpose, and
  `fetchLatestOfp` already has this same "latest, not necessarily right" limitation
  today) — not worth solving here, but worth a one-line comment where the check lives so
  it isn't mistaken for a stronger guarantee than it is.

## Verification

- `npm run typecheck && npm run lint && npm test` — new unit coverage for the
  this-path-specific date-building helper (distinct from `dispatch-time.ts`'s existing
  tests), same rigor as that file's own UTC/rollover cases.
- Live: with `.env` set locally (or a packaged build with the CI secret configured),
  pick a fleet aircraft with a known airline, click Generate, confirm the popup opens, log
  in if prompted, confirm the app automatically shows the generated OFP once the window
  closes with no extra clicks. Run it a second time in the same session to confirm the
  saved login carries over within one run (see the login-persistence finding above for
  why it won't across a restart).
