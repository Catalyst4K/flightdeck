# Flight Companion — Project Plan

> Working title: **Flightdeck** (rename before M0)
> Status: pre-kickoff. Nothing built yet.
> Target sim: Microsoft Flight Simulator 2024 (2020 as a bonus if free).

Drop this file in the repo root as `PLAN.md` on day one. It's the north star document —
Claude Code should read it at the start of every session. Detailed per-milestone task
breakdowns get their own files in `docs/` as you reach them; keep this one stable.

---

## 1. What we're building

Four pillars, in dependency order:

1. **Fleet** — a library of aircraft you own. Registration, type, livery/operator, and the
   SimBrief airframe parameters that go with it (OEW, MZFW, MTOW, MLW, max fuel, max pax,
   equipment codes). Each aircraft carries its own hours, cycles and current location.
2. **Dispatch** — pick an aircraft + route, generate an OFP through SimBrief, store the
   result against a planned flight.
3. **Tracking** — connect to the running sim over SimConnect, stream position and state,
   draw the aircraft on a world map against its planned route, detect phase changes
   (pushback → taxi → takeoff → climb → cruise → descent → landing → shutdown).
4. **Logbook** — persist completed flights: actual times, fuel burn, route flown, and a
   detailed landing report (touchdown rate, G, pitch, bank, crosswind, centreline offset,
   distance from threshold).

### Explicit non-goals for v1

Write these down so you don't get dragged sideways:

- X-Plane / P3D support. MSFS only. (Design the sim connector behind an interface so this
  stays *possible*, but do not build it.)
- VATSIM / IVAO online traffic overlays.
- Charts, METAR/TAF/NOTAM browsers, taxi diagrams.
- Cloud sync, accounts, multi-user, a backend server of any kind. **Everything local.**
- Streaming overlays.
- Mobile companion apps.

Anything on this list that you still want later becomes a v2 issue, not a v1 distraction.

---

## 2. Reference points

- **SimToolkitPro** (simtoolkitpro.co.uk) — the app you're modelling. Free, Electron-based,
  cross-platform. Study its UX, don't copy its assets or branding.
- **Volanta** — the main competitor; better reliability reputation. Good for comparing how
  flight phase detection and logbook presentation are handled.
- **Little Navmap** — open source (GPL), C++/Qt. Excellent reference for airport/navdata
  handling and map rendering, and it's readable source. Note the licence before borrowing
  anything more than ideas.

---

## 3. Architecture

### Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Electron** + electron-vite | Only mature option that gives you Node in the main process (needed for SimConnect) plus a web UI. It's what STKP uses. |
| UI | **React + TypeScript** | Largest ecosystem, best Claude Code support. |
| Styling | **Tailwind + shadcn/ui** | Dark, dense, aviation-ish UI comes cheap. |
| State | **Zustand** for UI state, **TanStack Query** for DB reads | Avoid Redux ceremony. |
| DB | **SQLite** via `better-sqlite3`, migrations via **Drizzle** | Local-first, synchronous API, trivial to back up (one file). |
| Sim link | **`node-simconnect`** (EvenAR) | Pure TypeScript. Speaks the SimConnect protocol directly over TCP or named pipes — no SDK files, no native compile step, no `node-gyp`. Supports MSFS 2020 and 2024. This single choice removes the biggest source of build pain. |
| Map | **MapLibre GL JS** | Free, vector tiles, no Mapbox token. Needs a tile source — see §4. |
| Charts | **Recharts** or **uPlot** | uPlot if the landing trace gets big. |
| Packaging | **electron-builder** (NSIS) | Signed installer later; unsigned is fine for personal use. |

Consider `msfs-simconnect-api-wrapper` (Pomax) on top of `node-simconnect` for a friendlier
API. Evaluate it during M1 — if it hides something you need, drop it and use the raw library.

### Alternatives, and why not

- **.NET 8 + Avalonia/WPF with the managed SimConnect wrapper.** Best SimConnect fidelity
  and the biggest pool of MSFS example code. Pick this if you're more comfortable in C#
  than TypeScript — it's a legitimate choice, not a wrong one. Costs you UI velocity.
- **Tauri + Rust.** Much smaller binaries, but the SimConnect story in Rust is thinner and
  you'd be fighting two learning curves at once.

### Process model

```
┌─────────────────────────────────────────────────┐
│ Electron main (Node)                            │
│  ├── SimConnectService   ← node-simconnect      │──▶ MSFS (named pipe / TCP)
│  │     emits telemetry @ 1–5 Hz (sampled)       │
│  │     buffers @ SIM_FRAME during approach      │
│  ├── FlightRecorder      (phase machine)        │
│  ├── SimBriefService     ← https fetch          │──▶ simbrief.com/api
│  ├── Database            ← better-sqlite3       │──▶ flightdeck.db
│  └── IPC bridge (typed channels)                │
└──────────────────┬──────────────────────────────┘
                   │ contextBridge, no nodeIntegration
┌──────────────────▼──────────────────────────────┐
│ Renderer (React)  — Fleet │ Dispatch │ Map │ Log │
└─────────────────────────────────────────────────┘
```

**Rule:** the renderer never touches the sim, the filesystem or the network directly.
Everything crosses a typed IPC boundary. This keeps the app secure and makes the sim
connector swappable later.

---

## 4. Before kickoff — accounts, keys, data

- [ ] **SimBrief account.** Note your Navigraph Alias (username) and Pilot ID. The fetch
      endpoint is `https://www.simbrief.com/api/xml.fetcher.php?username={alias}&json=1`
      and needs no key — it returns your most recent OFP as JSON. That's enough for v1.
- [ ] **SimBrief API key** — only needed if you want the app to *generate* plans directly
      rather than popping the SimBrief dispatch page. Keys are issued by email request to
      Navigraph with a description of your use. Request early; plan the fallback (open the
      dispatch URL in a browser window, then fetch the result) so you aren't blocked.
- [ ] **Custom airframes.** SimBrief lets you save airframes and reference them by internal
      ID (e.g. `123456_1582090020`) in place of a type code. This maps beautifully onto your
      fleet — one saved airframe per tail number. Decide whether fleet entries own a SimBrief
      airframe ID or push `acdata` JSON per request.
- [ ] **Airport/runway data.** OurAirports (`davidmegginson.github.io/ourairports-data/`) —
      public domain, regenerated nightly, ~80k airports plus `runways.csv`, `navaids.csv`,
      `airport-frequencies.csv`. Vendor a snapshot into the repo or ship a first-run import.
      Runway thresholds, lengths and headings are what the landing analyser needs.
- [ ] **Map tiles.** MapLibre needs a source. Options: OpenFreeMap (free, no key),
      MapTiler / Stadia (free tier + key), or self-hosted PMTiles for offline. Decide in M4.
- [ ] **MSFS SDK** — not required with `node-simconnect`, but install it anyway for the
      SimVar documentation.
- [ ] **GitHub repo**, private, `main` protected.

---

## 5. Data model (first cut)

Sketch only — refine in M0 when you write the Drizzle schema.

```
aircraft
  id, registration (unique), icao_type, name, operator, livery,
  simbrief_airframe_id?, oew, mzfw, mtow, mlw, max_fuel, max_pax,
  equip, transponder, pbn, wake_cat,
  current_icao, total_hours, total_cycles, is_active, notes

flight
  id, aircraft_id → aircraft, status (planned|active|completed|abandoned),
  flight_number, dep_icao, arr_icao, altn_icao, route_string, cruise_alt,
  sched_out_utc, sched_in_utc,
  actual_out_utc, actual_off_utc, actual_on_utc, actual_in_utc,
  block_minutes, air_minutes,
  fuel_planned_kg, fuel_out_kg, fuel_in_kg, fuel_burn_kg,
  pax, cargo_kg, zfw_kg, tow_kg, law_kg,
  ofp_id, ofp_json (raw SimBrief payload), sim_version, created_at

track_point                    -- keep sparse; this table gets big
  id, flight_id, ts_utc, lat, lon, alt_ft, agl_ft, ias_kt, gs_kt,
  vs_fpm, hdg_true, pitch, bank, phase, on_ground, fuel_kg

landing
  flight_id (unique), touchdown_ts_utc, vs_fpm, g_force,
  pitch_deg, bank_deg, hdg_true, ias_kt, gs_kt,
  wind_dir, wind_kt, headwind_kt, crosswind_kt,
  runway_ident, dist_from_threshold_m, centreline_offset_m,
  bounce_count, flap_setting, grade,
  trace_json  -- ±30 s of high-rate samples around touchdown
```

**Storage note:** at 1 Hz a ten-hour flight is 36,000 rows. Fine for SQLite, but downsample
cruise (write a point on significant change or every 15 s, whichever first) and keep full
rate only for the last 60 s before touchdown.

---

## 6. Milestones

Each milestone ends with something that runs. Don't move on until "Done when" is true.

### M0 — Skeleton (½ day)
Electron + Vite + React + TS boots to a window. SQLite opens, Drizzle migration runs,
one table exists. ESLint, Prettier, Vitest, GitHub Actions running lint + test on PR.
`CLAUDE.md` written (see §8).
**Done when:** `npm run dev` opens a window that reads and writes a row.

### M1 — SimConnect spike ⚠️ *the risky one, do it first*
A throwaway CLI script (`scripts/spike-simconnect.ts`) that connects to a running MSFS,
requests a handful of SimVars, and prints them at 1 Hz. Then fold it into a
`SimConnectService` in the main process with connect / disconnect / auto-retry, streaming
to the renderer over IPC.

Initial SimVar set — **verify each name and unit against the SDK docs during this spike
rather than trusting any list, including this one:**
`PLANE LATITUDE`, `PLANE LONGITUDE`, `INDICATED ALTITUDE`, `PLANE ALT ABOVE GROUND`,
`VERTICAL SPEED`, `AIRSPEED INDICATED`, `AIRSPEED TRUE`, `GROUND VELOCITY`,
`PLANE HEADING DEGREES TRUE`, `PLANE PITCH DEGREES`, `PLANE BANK DEGREES`,
`SIM ON GROUND`, `G FORCE`, `FUEL TOTAL QUANTITY WEIGHT`, `TOTAL WEIGHT`,
`AMBIENT WIND VELOCITY`, `AMBIENT WIND DIRECTION`, `ENG COMBUSTION:1`,
`GEAR HANDLE POSITION`, `FLAPS HANDLE INDEX`, `PARKING BRAKE POSITION`,
`ATC ID`, `ATC MODEL`, `TITLE`, `SIM RATE`, `IS SLEW ACTIVE`.

**Done when:** live numbers from the sim appear in the Electron window, the app survives
the sim being closed and reopened, and reconnects on its own.

### M2 — Fleet
CRUD for aircraft. Form with validation, list view, detail view. Seed from a JSON file so
you can bulk-add your existing fleet. Import/export as JSON.
**Done when:** you've entered your real fleet and it persists across restarts.

### M3 — Dispatch
Fetch the latest OFP by SimBrief username, parse it, map it onto a `flight` row linked to
an aircraft. Show route, fuel, weights, times, waypoint list. Store the raw JSON.
If the API key came through, add direct generation; otherwise open SimBrief's dispatch page
pre-filled with the aircraft's airframe and fetch on return.
**Done when:** you can plan a flight on SimBrief and pull it into the app in one click.

### M4 — Live map + tracking
MapLibre with the planned route drawn, the aircraft as a rotating marker, and a breadcrumb
trail. `FlightRecorder` state machine ties telemetry to the active flight and writes
`track_point` rows. Phase detection. Handle pause, slew, sim rate ≠ 1, and crashes.
**Done when:** a full short flight tracks end to end without babysitting.

### M5 — Logbook
Completed-flight list with filters. Flight detail: route map, altitude/speed profile
charts, block vs air time, fuel planned vs actual. Fleet stats roll up (hours, cycles,
last location per tail).
**Done when:** the M4 flight appears with correct times and fuel burn.

### M6 — Landing analysis
Ring-buffer high-rate samples (`SIM_FRAME` period) whenever below ~500 ft AGL. On the
`SIM ON GROUND` false→true transition, capture the touchdown record and freeze ±30 s of
trace. Compute crosswind from wind vs runway heading, nearest runway and distance from
threshold from the OurAirports data, centreline offset, and a bounce count from subsequent
ground transitions.

MSFS also exposes dedicated touchdown SimVars (`PLANE TOUCHDOWN NORMAL VELOCITY`,
`PLANE TOUCHDOWN PITCH DEGREES`, `PLANE TOUCHDOWN BANK DEGREES`, and similar). Test these
against your own derived numbers — where they agree, prefer the sim's, and keep the derived
values as a fallback.

**Done when:** you can grease one on and see a plausible fpm figure with a trace chart.

### M7 — Package and live with it
`electron-builder` NSIS installer, auto-update deferred. Crash/error logging to a rotating
local file. DB backup-on-launch. Then **fly with it for two weeks and fix what annoys you**
before writing a single new feature.

---

## 7. Known hard bits

| Risk | Mitigation |
|---|---|
| SimConnect flakiness — the historical complaint about STKP | Reconnect loop with backoff; never let a sim disconnect corrupt an in-progress flight; write track points incrementally, not at the end. |
| Sim pause / slew / 4× time compression corrupting times and fuel | Track sim time *and* wall time separately. Ignore samples while `IS SLEW ACTIVE`. Freeze the phase machine on pause. |
| Payware aircraft reporting odd values (fuel in wrong units, gear vars unused on gliders) | Per-aircraft-type overrides table; sanity-clamp obviously wrong values rather than trusting them. |
| Which flight is active? | Explicit "start flight" button in v1. Auto-detection by matching dep/arr is a v2 nicety and a bug factory. |
| MSFS 2024 SimVar differences vs 2020 | Detect sim version on connect; keep a per-version SimVar map behind one interface. |
| Landing detection false positives (hard bumps, bounces, touch-and-go) | Require sustained ground contact (>2 s) before finalising; count bounces separately. |
| Scope creep toward charts/VATSIM/overlays | §1 non-goals list. Re-read it monthly. |

---

## 8. Working with Claude Code

### `CLAUDE.md` — write this at M0

Keep it short and factual; it's loaded into every session.

```markdown
# Flightdeck

Electron + React + TypeScript desktop app. Local-first. See PLAN.md for scope.

## Commands
npm run dev / build / test / lint / typecheck
npm run db:generate   # drizzle migration from schema
npm run db:migrate

## Layout
src/main/       Electron main. Sim, DB, SimBrief, IPC handlers.
src/preload/    contextBridge only. No logic.
src/renderer/   React. Never imports from main/ except shared types.
src/shared/     Types and constants used by both sides.
scripts/        Spikes and data import.

## Rules
- Renderer has no filesystem, network or sim access. Everything via typed IPC.
- SimVar names and units go in src/main/sim/simvars.ts. Nowhere else.
- Every DB change is a Drizzle migration. Never hand-edit the .db.
- Money-free, account-free, server-free. If a feature needs a backend, it's out of scope.
- Prefer a boring, working implementation over a clever one.

## Testing
Vitest. Sim-dependent code sits behind SimConnectService — mock it, don't require a sim.
```

### Session workflow

- One milestone per branch, one concern per PR. `feat/m3-simbrief-fetch`.
- Start sessions by pointing Claude at `PLAN.md` and the specific milestone.
- For M1 and M6 — the two spikes — write a throwaway script first, confirm the real
  behaviour against a running sim, *then* ask for the production version. Don't let
  either be built from assumptions about how SimConnect behaves.
- Record every surprising sim behaviour in `docs/simconnect-notes.md` as you find it.
  That file will save you more time than anything else in the repo.
- Ask for tests alongside anything touching the phase machine or landing maths. Those are
  hard to eyeball and easy to get subtly wrong.

---

## 9. Decisions to settle at kickoff

1. **Name.** Affects package name, DB path, window title, repo. Pick before M0.
2. **Electron/TypeScript or .NET/C#?** §3 recommends the former; your comfort wins.
3. **MSFS 2024 only, or 2020 too?** Cheap to support both *if* decided now, expensive later.
4. **Fleet ↔ SimBrief airframes:** saved airframe IDs, or push `acdata` per request?
5. **Units:** store everything SI internally (kg, m, m/s) and convert at the edges, or store
   as the sim reports? Pick one now — mixed units is the classic source of silent bugs.
6. **Licence and visibility.** Private repo, or open source it? Affects whether you can
   vendor OurAirports data (public domain, so yes) and how you treat any GPL reference code.
