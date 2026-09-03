# Flightdeck

Electron + React + TypeScript desktop app for tracking flights in Microsoft Flight
Simulator 2024: fleet management, SimBrief dispatch, live SimConnect tracking, and a
logbook with landing analysis. Runs locally against a local SQLite database.

**Read `PLAN.md` in full before doing anything else.** It has the architecture, data
model, milestone breakdown, and the six open decisions in §9. `docs/decisions.md` is
where those decisions get recorded once made — check it before assuming a default.

## First session checklist

If `package.json` doesn't exist yet, this is session one. Before writing any app code:

1. Read `PLAN.md` end to end.
2. Walk through the six decisions in `PLAN.md` §9 with the user and record the answers
   in `docs/decisions.md`.
3. Scaffold M0 (see PLAN.md — Electron + Vite + React + TS, SQLite via better-sqlite3,
   Drizzle migrations, ESLint/Prettier/Vitest, GitHub Actions running lint + test on PR).
4. Do not start M1 (the SimConnect spike) until M0's `npm run dev` opens a window that
   reads and writes a row.

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
  nothing arrives by accident either, and the default stays local.
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

For the repo itself, these are worth having on and are free for public repos: Dependabot
alerts, secret scanning with push protection, and branch protection on `main` requiring a
PR. Note that GitHub Actions workflows here run on `pull_request` from forks — never add a
workflow that exposes secrets to fork PRs (`pull_request_target` with a checkout of the
PR head is the classic mistake).

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

## Milestones

See `PLAN.md` §6 for the full breakdown (M0–M7). Work one milestone per branch
(`feat/m3-simbrief-fetch`), one concern per PR. Don't start a milestone's tasks until
the previous milestone's "Done when" condition is actually true.

For M1 (SimConnect spike) and M6 (landing analysis spike): write a throwaway script in
`scripts/` first, confirm real behaviour against a running sim, *then* build the
production version. Don't build either from assumptions about how SimConnect behaves —
log anything surprising in `docs/simconnect-notes.md` as you find it.
