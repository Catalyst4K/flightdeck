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
- **Login persistence works, once the process survives long enough to flush it.** The
  spike's first run appeared not to save the login — actually a symptom of the bug above
  (the whole process got killed the instant the window closed, likely before the session
  cookie write finished). Once that was fixed, the second run completed the full
  login-through-generation flow in one go. Electron's default session is disk-backed
  under the app's `userData` directory by default; nothing extra needs building for this
  as long as the popup is a normal window in the app's default session (not a fresh
  in-memory partition).

## Credential storage — agreed with Callum 2026-09-03, recorded in `docs/decisions.md`

The API key goes in the existing `app_setting` key/value table, entered via a masked
Settings field — the same pattern `simbriefUsername` already uses. An OS-native
credential store was considered and set aside: it's a new dependency (supply-chain
scrutiny CLAUDE.md already flags) that would make this one setting behave differently
from every other one, for a local-only single-user app where the SQLite DB is already the
trust boundary.

## Implementation

### 1. Settings: SimBrief API key

- `src/main/db/settings-repo.ts`: `getSimbriefApiKey`/`setSimbriefApiKey`, mirroring
  `getSimbriefUsername`/`setSimbriefUsername` exactly (same `app_setting` key/value
  shape, new key e.g. `simbriefApiKey`).
- `src/shared/ipc.ts` → `preload/index.ts` → `src/main/index.ts`: new IPC channels
  `settingsGetSimbriefApiKey`/`settingsSetSimbriefApiKey`, same lockstep as every other
  setting.
- `SettingsView.tsx`: a masked (`type="password"`) input next to the existing SimBrief
  username field, with a "Clear" action. Never logged, never echoed back unmasked once
  saved — same expectation CLAUDE.md already sets for the Navigraph tokens note.

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

- `DispatchView.tsx`'s "Plan a flight" panel: a "Generate…" button alongside the existing
  "Plan on SimBrief…" one, enabled only when a SimBrief API key is saved (checked via a
  new settings-get call on mount, same pattern as `useLandingThresholds`). Clicking it
  shows a loading state ("Generating — check the SimBrief window") until the IPC call
  resolves, then runs the same fetch-and-match flow "Fetch latest OFP" already runs.
- The existing "Plan on SimBrief…" (external browser) button stays, unconditionally —
  the fallback for no key, and simply a user preference either way.

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
- Live: save a real API key in Settings, pick a fleet aircraft with a known airline,
  click Generate, confirm the popup opens, log in if prompted, confirm the app
  automatically shows the generated OFP once the window closes with no extra clicks.
  Run it a second time in the same session to confirm the saved login carries over.
