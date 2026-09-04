# Flightdeck

Electron + React + TypeScript desktop app for tracking flights in Microsoft Flight
Simulator 2024: fleet management, SimBrief dispatch, live SimConnect tracking, and a
logbook with landing analysis. Runs locally against a local SQLite database.

**Read `PLAN.md` in full before doing anything else.** It has the architecture, data
model, and the milestone history — M0–M5 done, M6 redesigned as an ongoing plan, M7
partial; see its §6 and §10. `docs/decisions.md` is the log of every decision and
judgment call made since, including the six originally listed as open in PLAN.md §9 (all
resolved) — check it before assuming a default.

## Starting a new piece of work

This is a working app, not a from-scratch build — `package.json` exists, most of PLAN.md's
milestones are done, and ongoing feature work is organized as design docs, not numbered
milestones:

1. Check `PLAN.md` §10 and `git branch -a` for the current list of `plan/<name>` branches.
   If the user's request matches one, read its `docs/plans/<name>.md` in full before
   touching code — it carries context (what's verified against real data, what's still
   open) that isn't repeated anywhere else.
2. For a genuinely new feature with no existing plan: write one, following the shape of
   the existing plans (context, what's confirmed vs. assumed, implementation, open
   questions), on its own `plan/<name>` branch, before writing production code — same
   spike-first discipline as M1/M6 below, generalised to any undocumented external system
   (a third-party API, an undocumented file format), not just SimConnect.
3. One plan, one branch, one PR. Don't mix unrelated changes into a plan branch.

## Commands (once scaffolded)

```
npm run dev          # electron-vite dev
npm run build         # production build
npm run test           # vitest
npm run lint            # eslint
npm run typecheck        # tsc --noEmit
npm run db:generate       # drizzle-kit generate, from src/main/db/schema.ts
npm run db:migrate         # apply migrations
```

## Layout

```
src/main/       Electron main process. Sim connector, DB, SimBrief client, IPC handlers.
src/preload/    contextBridge exposure only — no logic here.
src/renderer/   React UI. Never imports from src/main except via src/shared types.
src/shared/     Types and constants used by both main and renderer.
scripts/        One-off spikes and data import scripts (e.g. OurAirports import).
docs/           decisions.md, simconnect-notes.md, and per-milestone notes as needed.
```

## Rules

- The renderer never touches the filesystem, network, or SimConnect directly. Every
  side effect crosses a typed IPC channel defined in `src/shared/ipc.ts`.
- SimVar names, units, and per-aircraft-type overrides live only in
  `src/main/sim/simvars.ts`. Don't scatter SimVar strings through the codebase.
- Every schema change is a Drizzle migration, generated via `npm run db:generate`.
  Never hand-edit `flightdeck.db` or a migration file after it's been applied.
- Anything that sends data off the machine, stores credentials, or introduces an account
  or a server is a **decision, not an implementation detail**. Propose it, get agreement,
  and record it in `docs/decisions.md` before building it. Nothing is ruled out — but
  nothing arrives by accident either, and the default stays local. The backend-service
  credential broker (`docs/plans/backend-service.md`) is the first case of this actually
  happening — SimBrief and Navigraph access built in rather than every user requesting
  their own key — not a hypothetical the rule is guarding against anymore.
- Prefer a boring, working implementation over a clever one. This is a personal tool
  flown solo, not a platform.
- Convert units at the IPC boundary per the decision in `docs/decisions.md` — don't let
  sim-native and SI units mix inside the same layer.

## Security

**The GitHub repo is public** (`github.com/Catalyst4K/flightdeck`), and the app is
distributed as an installable binary. Both mean mistakes here are visible and shipped, so
treat security as part of finishing a change rather than a separate pass.

Before committing or pushing:

- **Never commit secrets.** No API keys, tokens, cookies, or credentials — not in source,
  not in test fixtures, not in a `docs/` note, not in a commit message. Real cases already
  live in this project: the SimBrief username, and the Navigraph OAuth tokens the SID/STAR
  work will need. Those belong in the `app_setting` table at runtime, never in the repo.
  The backend service's own credentials (the SimBrief signing key, the Navigraph
  `client_secret`) are a stricter case of the same rule: they never touch *this* repo at
  all, in any form — not as a value, and not as platform env vars either, since this repo
  isn't where that service lives. See the backend-service paragraph below.
- **A third party's protected mechanism is not "a secret" in the API-key sense, but treat
  it the same way.** SimBrief's real request-signing scheme is deliberately not documented
  in this repo — not in prose, not in code, not even in a "throwaway" spike. A working
  implementation of a keyed signature scheme discloses it more completely than any
  paraphrase would, so "it's just code, not a description" is not an exception — a real
  case of exactly this mistake happened and was corrected (`docs/decisions.md`,
  2026-09-04). If a future spike needs to exercise a mechanism like this, run it locally,
  capture only the safe findings in the matching `docs/*-notes.md`, and don't commit the
  script itself.
- **Check what a broad `git add` actually staged** (`git status` after it) and read any
  file whose name doesn't obviously explain its contents.
- **Scrub personal data out of test fixtures.** Real OFPs carry a SimBrief pilot ID; real
  GSX receipts carry tail numbers, airports and prices. Fixtures should be trimmed and
  anonymised, not pasted whole.

When touching anything that crosses a trust boundary, actively look for the vulnerability
rather than assuming there isn't one:

- **External data is data, never code.** OFP JSON, GSX receipt JSON, imported CSVs and
  SimConnect strings are all third-party input. No `eval`, no `new Function`, no
  `innerHTML`/`dangerouslySetInnerHTML` with it. Parse defensively — a malformed field
  should degrade, not throw or execute.
- **URLs handed to `shell.openExternal`.** Dispatch builds SimBrief URLs from user input
  and DB values; anything interpolated must be `encodeURIComponent`'d, and the scheme must
  be `https:` — never pass through a URL derived from third-party data without checking
  its scheme, since `file:` and other schemes can do real damage.
- **File paths from outside the app.** Import/export dialogs and the planned GSX receipts
  reader all take paths that didn't come from us. Resolve them and confirm they're inside
  the directory you expect before reading or writing.
- **Queries go through Drizzle's query builder**, which parameterises. If you ever reach
  for raw `sql`` `` with a runtime value in it, that's the moment to stop and ask why.
- **The renderer is not a security boundary.** `sandbox: false` is set on the
  `BrowserWindow` (needed for the preload), so a renderer compromise is serious. Keep
  every side effect behind a typed IPC channel that validates its input in the main
  process — the renderer's checks are for the user's benefit, not the app's safety. Never
  load remote content into a window.
- **New dependencies are supply chain.** Prefer few, well-known packages. Check
  `npm audit` when adding one, and keep `package-lock.json` committed. A dependency that
  wants postinstall scripts or network access at build time deserves scrutiny.

**A second trust boundary now exists: the backend-service Flightdeck talks to over HTTPS**
(`docs/plans/backend-service.md` — a credential broker for SimBrief and Navigraph, living
in its own private repo, not this one). It changes how a couple of the rules above apply:
- The base URL is one constant (matching the `simvars.ts` discipline above), always
  `https:`, never sprinkled through the codebase.
- Its responses are external data like any other third-party input — parse them
  defensively, same as OFP/GSX JSON.
- Nothing about its implementation, secrets, or deployment belongs in this repo. If you're
  ever asked to change how Flightdeck talks to it, that's a change to `src/main/backend/`
  calling an existing deployed endpoint — not a reason to touch, vendor, or inline anything
  from the other repo.

For the repo itself, these are worth having on and are free for public repos: Dependabot
alerts, secret scanning with push protection, and branch protection on `main` blocking
force-push and branch deletion (deliberately *not* requiring a PR — this is developed
solo, pushing directly from more than one machine; see `scripts/github-repo-security.sh`
for why that's a considered choice, not an oversight). Note that GitHub Actions workflows
here run on `pull_request` from forks — never add a workflow that exposes secrets to fork
PRs (`pull_request_target` with a checkout of the PR head is the classic mistake).

If you find something, say so plainly and fix it or flag it — don't quietly work around it.

## Testing

Vitest. Anything that depends on a running sim sits behind `SimConnectService` — write
unit tests against a mock of that interface, don't require a live sim to run `npm test`.
The phase-detection state machine and the landing-analysis maths (crosswind, centreline
offset, distance-from-threshold) need real test coverage — they're easy to get subtly
wrong and hard to eyeball.

`better-sqlite3` is a native module and `npm install` rebuilds it once, for Electron's
Node ABI (via `postinstall`) — not the system Node ABI. That's why `npm test` and
`npm run db:migrate` run through `electron` in `ELECTRON_RUN_AS_NODE=1` mode instead of
plain `node`/`tsx`: it's the same binary the app ships with, so there's only one build of
the module to keep track of. Don't "simplify" these scripts back to bare `vitest`/`tsx` —
that reintroduces an ABI mismatch and the native module fails to load.

## Milestones and ongoing plans

See `PLAN.md` §6 for the full M0–M7 breakdown and status (M0–M5 done, M7 partial, M6
redesigned) and §10 for the current list of `plan/<name>` branches carrying feature work
forward. "Starting a new piece of work" above covers the workflow — one plan, one branch,
one PR.

The M1/M6 rule generalises: for anything depending on a real external system whose
behaviour isn't documented — SimConnect, SimBrief's JSON schema, GSX's receipt files, a
future Navigraph integration — write a throwaway script or read real captured data first,
confirm actual behaviour, *then* build the production version. Don't build any of it from
assumptions. Log anything surprising in the matching `docs/*-notes.md` file
(`simconnect-notes.md`, `simbrief-notes.md`, and so on) as you find it — this has paid for
itself many times over already.
