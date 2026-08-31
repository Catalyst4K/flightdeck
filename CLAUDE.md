# Flightdeck

Electron + React + TypeScript desktop app for tracking flights in Microsoft Flight
Simulator 2024: fleet management, SimBrief dispatch, live SimConnect tracking, and a
logbook with landing analysis. Local-first — no accounts, no server, no cloud sync.

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
- No accounts, no backend, no telemetry-to-a-server. If a feature needs one, it's out
  of scope for v1 — see PLAN.md §1 non-goals before proposing it.
- Prefer a boring, working implementation over a clever one. This is a personal tool
  flown solo, not a platform.
- Convert units at the IPC boundary per the decision in `docs/decisions.md` — don't let
  sim-native and SI units mix inside the same layer.

## Testing

Vitest. Anything that depends on a running sim sits behind `SimConnectService` — write
unit tests against a mock of that interface, don't require a live sim to run `npm test`.
The phase-detection state machine and the landing-analysis maths (crosswind, centreline
offset, distance-from-threshold) need real test coverage — they're easy to get subtly
wrong and hard to eyeball.

## Milestones

See `PLAN.md` §6 for the full breakdown (M0–M7). Work one milestone per branch
(`feat/m3-simbrief-fetch`), one concern per PR. Don't start a milestone's tasks until
the previous milestone's "Done when" condition is actually true.

For M1 (SimConnect spike) and M6 (landing analysis spike): write a throwaway script in
`scripts/` first, confirm real behaviour against a running sim, *then* build the
production version. Don't build either from assumptions about how SimConnect behaves —
log anything surprising in `docs/simconnect-notes.md` as you find it.
