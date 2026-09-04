# Flight Companion — Project Plan

> Status: in active development. M0–M5 done, M7 partially done; M6's core shipped as an
> ongoing plan rather than a milestone, gated on one spike — see §6 and §10. This document
> is the original plan, kept as the north star for scope and architecture; `docs/decisions.md`
> is the running record of what actually happened and where it diverged.
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
- Charts, TAF/NOTAM browsers, taxi diagrams.
- Streaming overlays.
- Mobile companion apps.

Anything on this list that you still want later becomes a v2 issue, not a v1 distraction.

**One item has already happened: a METAR panel was built** (`MetarPanel.tsx`,
`src/main/weather/metar-client.ts`), on Dispatch rather than Track after a later move
(`docs/decisions.md`, 2026-09-02). Narrowly in scope — current conditions for the
dep/arr/altn airports already on screen, not a general weather browser — so left off the
list above rather than treated as a broken rule; TAF/NOTAM and a standalone browser stay
out of scope.

**Accounts, sync and a backend are no longer ruled out — and one is now actually being
built.** v1 was deliberately local-only, and local stays the default for everything that
doesn't specifically need otherwise. But it's a starting point rather than a principle
now: `docs/plans/backend-service.md` (§10) is a small credential-broker service — built
in SimBrief and Navigraph access, so no end user requests their own API key, the way
SimToolkitPro works. Two conditions were set for this kind of thing and both were followed
here: it went through `docs/decisions.md` first (2026-09-03, refined 2026-09-03), and it
runs in its own separate, private repo rather than inside this one — this repo stays
GPL-3.0 and local-first regardless of what that service does. **The second original
condition — "local-only usage keeps working without it" — is not yet guaranteed**: the
backend plan's own open questions list a bring-your-own-key fallback as "worth a decision,
not a hard blocker," which means as of this writing a user with no access to the shared
service (or who doesn't trust it) has no confirmed path to use SimBrief/Navigraph
features standalone. Settle that explicitly before or shortly after the backend ships,
not by default.

---

## 2. Reference points

Apps studied for ideas on scope, UX and feature handling — install it, see how it solves
a problem, form your own opinion, implement your own solution.

- **SimToolkitPro** (simtoolkitpro.co.uk) — free, Electron-based, cross-platform, the
  closest prior art for this app's scope. The main reference for what a screen should
  show and what a workflow should feel like. Closed source, so it's a UX comparison
  point, not a code source.
- **Volanta** — the main competitor; better reliability reputation. Good for comparing how
  flight phase detection and logbook presentation are handled. Also closed source.
- **Little Navmap** — open source (GPL), C++/Qt. Excellent reference for airport/navdata
  handling and map rendering, and it's readable source. Its licence is GPL and this
  project is also GPL now, but that doesn't make lifting its code free of attribution —
  ideas and algorithms observed by reading it are fair game; if a chunk of its actual
  code is ever wanted, bring it in properly (with attribution, respecting its licence)
  rather than by copy-paste.

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

This was the pre-M0 checklist. Kept for the record; current state noted against each item
rather than deleted, since a couple are still open and the rest explain decisions later
sections now assume.

- [x] **SimBrief account.** Resolved — the keyless
      `xml.fetcher.php?username={alias}&json=1` fetch is what Dispatch uses, and turned out
      to accept far more than "just fetch the latest": the same prefill mechanism generates
      plans too, verified live (`docs/simbrief-notes.md`). No API key needed for anything
      built so far.
- [x] **SimBrief API key.** Obtained 2026-09-03, along with SimBrief's own integration
      package. **Corrects the 2026-09-01 assumption**, not just updates it: the key still
      doesn't turn generation into a plain server-to-server REST call (the pilot still has
      to log in inside a popup), but the package clarifies exactly what a key *does* buy —
      a per-request authorization hash and, more usefully, the exact identifier of the plan
      just generated, rather than "fetch whatever's newest and hope." The keyless prefill
      URL still covers everything already built; the key is what a proper in-app "Generate"
      button (rather than a browser hand-off) would need. See `docs/simbrief-notes.md`'s
      Generation section and `docs/plans/simbrief-plan-generation.md`.
- [x] **Custom airframes.** Resolved — fleet entries own a SimBrief airframe ID
      (`aircraft.simbrief_airframe_id`, see §5 and `docs/decisions.md` §4). Confirmed live
      that the internal ID's format is `<simbrief user id>_<airframe id>` and that the
      second half is also the path segment of that airframe's direct edit URL
      (`docs/simbrief-notes.md`) — used in `docs/plans/fleet-simbrief-airframe.md`.
- [ ] **Airport/runway data.** Half done. `resources/airports.csv` is vendored (OurAirports,
      public domain) but trimmed to a name/ICAO search slice for Dispatch's airport
      picker — lat/lon, and `runways.csv`/`navaids.csv` entirely, were deliberately left out
      pending the milestone that actually needs them
      (`docs/decisions.md`, 2026-09-01). That milestone is now
      `docs/plans/landing-analysis.md`, and this is its first prerequisite: no runway
      threshold, length or heading data exists in the app yet.
- [x] **Map tiles.** Resolved — OpenFreeMap, no key, matching the reasoning here (shared
      quota risk for a public app) — see `docs/decisions.md`.
- [x] **MSFS SDK** — not needed; `node-simconnect`'s own docs plus live verification against
      a running sim (`docs/simconnect-notes.md`) covered everything actually used.
- [x] **GitHub repo** — public rather than private (a deliberate later choice, not the
      original private-by-default plan; see the GPL-3.0 relicensing entry in
      `docs/decisions.md`, 2026-09-03), with `main` protected against force-push and
      deletion and the standard security settings enabled
      (`scripts/github-repo-security.sh`).

---

## 5. Data model

This was a first-cut sketch pre-M0. The real schema (`src/main/db/schema.ts`, source of
truth — regenerate this section's text from there if it drifts again) diverged from it in
ways worth recording, not just silently overriding:

```
aircraft
  id, registration (unique), icao_type, operator, operator_iata,
  simbrief_airframe_id?, current_icao, created_at

flight
  id, aircraft_id → aircraft, status (planned|active|completed|abandoned),
  flight_number, dep_icao, arr_icao, altn_icao, route_string, cruise_alt_m,
  sched_out_utc, sched_in_utc,
  actual_out_utc, actual_off_utc, actual_on_utc, actual_in_utc,
  block_minutes, air_minutes,
  fuel_planned_kg, fuel_out_kg, fuel_in_kg, fuel_burn_kg,
  pax, cargo_kg, zfw_kg, tow_kg, ldw_kg,
  ofp_id, ofp_json (raw SimBrief payload, verbatim), sim_version, created_at

app_setting                    -- key/value; SimBrief username, unit preferences, etc.
  key (primary key), value

track_point                    -- keep sparse; this table gets big
  id, flight_id, ts_utc, latitude, longitude, altitude_m, altitude_agl_m,
  indicated_airspeed_ms, ground_speed_ms, vertical_speed_ms, heading_true_deg,
  pitch_deg, bank_deg, phase, on_ground, fuel_kg

landing                        -- shipped 2026-09-03 (§10). One row per flight.
  id, flight_id (unique) → flight, touchdown_ts_utc,
  vertical_speed_ms, g_force, pitch_deg, bank_deg, heading_true_deg,
  indicated_airspeed_ms, ground_speed_ms, wind_speed_ms, wind_direction_deg,
  headwind_ms?, crosswind_ms?, runway_ident?, distance_from_threshold_m?,
  centreline_offset_m?, flap_setting?, touchdown_source ('simvar'|'derived')
```

What changed, and why it matters if you're reading this sketch as a guide to the real
schema rather than the schema itself:

- **`aircraft` dropped every performance field** (`oew`, `mzfw`, `mtow`, `mlw`, `max_fuel`,
  `max_pax`, `equip`, `transponder`, `pbn`, `wake_cat`) along with `total_hours`/
  `total_cycles`. Deliberate simplification, not an oversight: that data lives in the
  linked SimBrief airframe profile instead of being duplicated here, and hours/cycles are
  computed live from flight history rather than stored (`docs/decisions.md`, 2026-09-01 —
  real data loss for the fields dropped, done at Callum's request). `name` and `livery`
  were never built at all.
- **Everything is SI** (`_m`, `_ms`, `_kg`), per decision §9.5 below, converted only at the
  IPC boundary — not the sim-native units this sketch used (`alt_ft`, `ias_kt`, `vs_fpm`).
- **`landing` didn't exist when this section was first written; it does now** — see the
  table above, shipped 2026-09-03 as the core of `docs/plans/landing-analysis.md`,
  informed by what the phase machine and SimConnect layer already did by that point (both
  already detected the touchdown transition, at no extra cost to this milestone).

**Storage note** (still holds): at 1 Hz a ten-hour flight is 36,000 rows. Fine for SQLite.
`FlightRecorder` downsamples cruise to ~15 s intervals and writes every other phase at the
sim feed's 1 Hz rate, so a short flight is a few hundred rows in practice
(`docs/decisions.md`, 2026-09-01).

---

## 6. Milestones

Each milestone ends with something that runs. Don't move on until "Done when" is true.

**M0–M5 are done.** M6's core shipped 2026-09-03 as an ongoing plan rather than a
milestone, gated on one spike (see below and §10). M7 is partially done. Status is noted
under each; the original milestone text is kept because it's still an accurate description
of what was built, not rewritten as if this had been known from the start.

### M0 — Skeleton (½ day) — ✅ done
Electron + Vite + React + TS boots to a window. SQLite opens, Drizzle migration runs,
one table exists. ESLint, Prettier, Vitest, GitHub Actions running lint + test on PR.
`CLAUDE.md` written (see §8).
**Done when:** `npm run dev` opens a window that reads and writes a row.

### M1 — SimConnect spike ⚠️ *the risky one, do it first* — ✅ done
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

Shipped as `src/main/sim/SimConnectService.ts` / `src/main/sim/simvars.ts`, all at a fixed
1 Hz (`SimConnectPeriod.SECOND`) — no higher-rate request exists yet, which
`docs/plans/landing-analysis.md` needs and picks up. Live behaviour that didn't match
assumptions is logged in `docs/simconnect-notes.md`, per this milestone's own rule below.
The `msfs-simconnect-api-wrapper` evaluation this milestone floated never happened as a
separate step — `node-simconnect` was used directly from the start and that was never
revisited, so it's absent from `package.json`. Not a problem in practice; noted so this
section doesn't imply an evaluation took place that didn't.

**LGPL note actioned, later than planned.** This milestone said to ship the
`node-simconnect` notice with the installer as part of M1, not as an afterthought — it
ended up being exactly that: done during the GPL-3.0 relicensing pass
(`docs/decisions.md`, 2026-09-03), not here. `THIRD-PARTY-LICENSES.md` now carries it,
shipped via `extraResources` in `electron-builder.yml`.

### M2 — Fleet — ✅ done
CRUD for aircraft. Form with validation, list view, detail view. Seed from a JSON file so
you can bulk-add your existing fleet. Import/export as JSON.
**Done when:** you've entered your real fleet and it persists across restarts.

Built, then deliberately simplified — see §5's note on the `aircraft` table. Import/export
is JSON via `src/main/db/aircraft-import-export.ts`; a CSV logbook import exists too
(`db/logbook-import.ts`), which this milestone didn't originally scope.

### M3 — Dispatch — ✅ done
Fetch the latest OFP by SimBrief username, parse it, map it onto a `flight` row linked to
an aircraft. Show route, fuel, weights, times, waypoint list. Store the raw JSON.
If the API key came through, add direct generation; otherwise open SimBrief's dispatch page
pre-filled with the aircraft's airframe and fetch on return. If a personal SimBrief API
key is used: its Navigraph-approved use case needs to cover "used by many people via a
public free app," not personal use — don't bake a personally-issued key into a public
build without that (see `docs/decisions.md`). The free, keyless `xml.fetcher.php?username=`
fetch has no such issue and should stay the default regardless.
**Done when:** you can plan a flight on SimBrief and pull it into the app in one click.

Built without the API key, which wasn't obtained until 2026-09-03 — see §4 for what having
one now actually changes. Beyond the original scope, all shipped 2026-09-03 (§10): flight
number and departure-time prefill and cost index (`plan/simbrief-generation`), an
advanced-options dialog and reloading a past plan's settings (`plan/dispatch-advanced-tab`),
SID/STAR route labelling (half of `plan/sid-star-selection` — swapping in a different
procedure is the half still blocked on Navigraph credentials), and managing the Fleet↔
SimBrief airframe link this milestone introduced (`plan/fleet-simbrief-airframe`).

### M4 — Live map + tracking — ✅ done
MapLibre with the planned route drawn, the aircraft as a rotating marker, and a breadcrumb
trail. `FlightRecorder` state machine ties telemetry to the active flight and writes
`track_point` rows. Phase detection. Handle pause, slew, sim rate ≠ 1, and crashes.
Tile source decision (§4): for a free, publicly-distributed app with unpredictable
adoption, prefer one with no shared quota to blow through (OpenFreeMap, or self-hosted
PMTiles) over a shared MapTiler/Stadia key — see `docs/decisions.md`.
**Done when:** a full short flight tracks end to end without babysitting.

`FlightRecorder`/`TrackingController` (`src/main/tracking/`) match this description
closely, including the pause/slew handling. One thing not yet built: starting tracking is
still a manual button press rather than automatic — `AutoStartDetector.ts` exists and
watches for a settled sim state, but the manual "Start tracking" control hasn't been
removed. Map gained follow/zoom controls and an identity bar beyond the original scope
(`docs/decisions.md`, 2026-09-02).

### M5 — Logbook — ✅ done
Completed-flight list with filters. Flight detail: route map, altitude/speed profile
charts, block vs air time, fuel planned vs actual. Fleet stats roll up (hours, cycles,
last location per tail).
**Done when:** the M4 flight appears with correct times and fuel burn.

Built as described. `plan/gsx-invoices` (shipped 2026-09-03, §10) extends the flight-detail
summary with per-flight ground-service costs, which this milestone didn't anticipate —
GSX's invoice feature didn't exist yet when this plan was written.

### M6 — Landing analysis — core shipped 2026-09-03, gated on a spike (§10)
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

**This idea was not dropped, and its core is now built** (`docs/decisions.md`, 2026-09-03):
runway data vendored, touchdown captured into a new `landing` table, and both UI surfaces
(Fleet's per-aircraft history, Logbook's per-flight pane, sharing one severity component)
shipped. What this milestone couldn't have known going in — the phase machine already had
a `landing` phase and already detected the `SIM ON GROUND` false→true transition described
above, so the capture point cost nothing new to add — turned out to make most of this
milestone cheaper than it looked. The one thing still gated: whether MSFS 2024's dedicated
touchdown SimVars this milestone asks about are actually trustworthy is unconfirmed, so
every row is stamped `touchdown_source: 'derived'` and `scripts/spike-landing.ts` is
sitting ready for the next real landing to answer it. See §10 for the full breakdown.

### M7 — Package and live with it — partially done
`electron-builder` NSIS installer, auto-update deferred. Crash/error logging to a rotating
local file. DB backup-on-launch. Then **fly with it for two weeks and fix what annoys you**
before writing a single new feature.

**Packaging config exists** (`electron-builder.yml`, `.github/workflows/package.yml`) and
the "fly with it" half has, in effect, already happened — Callum has been dispatching and
tracking real flights throughout M2–M5's development, which is where several of the
`docs/decisions.md` entries and the GSX/SimBrief plans came from. **Not yet built:**
crash/error logging and DB backup-on-launch. No installer has actually been produced or
run outside CI's packaging smoke test.

**Before a public flightsim.to release** (separate from M7, do this once the app is
actually ready to give away): ship the LGPL NOTICE file — done, ahead of schedule, as part
of the GPL-3.0 relicensing pass rather than M1 (see M1 above and
`docs/decisions.md`, 2026-09-03) — ship the ODbL attribution for the vendored airline
database (resources/airlines.LICENSE.txt) alongside it — also done, in the same pass, via
`THIRD-PARTY-LICENSES.md` — drop in a "not affiliated with or endorsed by Microsoft or
Asobo Studio" disclaimer — **not yet done** — re-read flightsim.to's current Terms of
Service directly (their content-license clause caused a developer boycott in 2023 — check
it hasn't regressed) — **not yet done** — and consider a listing title that doesn't
collide with flightsim.to's own "FlightDeck" creator-analytics product. Full context in
`docs/decisions.md`'s 2026-09-01 licence-audit and airline-search entries.

One thing this section didn't anticipate: the project moved from "give it away free" to
"GPL-3.0, with dual licensing kept possible" (`docs/decisions.md`, 2026-09-03). A
flightsim.to release and a commercial licence aren't in tension — GPL permits both — but
re-read that entry, `CONTRIBUTING.md` and `THIRD-PARTY-LICENSES.md` before the first
public release, not just this section, since they're the ones that actually govern it now.

---

## 7. Known hard bits

| Risk | Mitigation | Status |
|---|---|---|
| SimConnect flakiness — the historical complaint about STKP | Reconnect loop with backoff; never let a sim disconnect corrupt an in-progress flight; write track points incrementally, not at the end. | Built — `SimConnectService`'s reconnect loop, incremental `track_point` writes. |
| Sim pause / slew / 4× time compression corrupting times and fuel | Track sim time *and* wall time separately. Ignore samples while `IS SLEW ACTIVE`. Freeze the phase machine on pause. | Built — see `FlightRecorder`, and `docs/decisions.md`'s flight-reload-spike entries (2026-09-02) on the closely related stale-telemetry-after-reload finding. |
| Payware aircraft reporting odd values (fuel in wrong units, gear vars unused on gliders) | Per-aircraft-type overrides table; sanity-clamp obviously wrong values rather than trusting them. | **Not built.** No per-aircraft-type overrides table exists in `simvars.ts` or the schema. Revisit if a real payware aircraft is found reporting bad values — no evidence of one yet, so this hasn't been prioritised. |
| Which flight is active? | Explicit "start flight" button in v1. Auto-detection by matching dep/arr is a v2 nicety and a bug factory. | **In progress**, sooner than "v2 nicety" suggested — `AutoStartDetector.ts` exists and watches for a settled sim state, but the manual "Start tracking" button hasn't been removed yet (both coexist in `TrackView.tsx`). The bug-factory risk this row warned about is exactly why: see `docs/decisions.md`'s stale-telemetry findings, which is what the detector's "settled state" logic exists to guard against. |
| MSFS 2024 SimVar differences vs 2020 | Detect sim version on connect; keep a per-version SimVar map behind one interface. | **Not built, and not needed** — MSFS 2020 support was never pursued (§1 non-goals), so there's only ever been one SimVar map. The `flight.sim_version` column exists but nothing populates or branches on it yet. |
| Landing detection false positives (hard bumps, bounces, touch-and-go) | Require sustained ground contact (>2 s) before finalising; count bounces separately. | **Partially built** (2026-09-03) — the `landing` table and capture logic exist and are guarded to fire once per flight, but `bounce_count` was deliberately cut from v1 (`docs/decisions.md`) rather than built speculatively with no other use yet. A genuine touch-and-go could still misfire the one-time capture; not yet tested against one. |
| Scope creep toward charts/VATSIM/overlays | §1 non-goals list. Re-read it monthly. | Holding — no VATSIM/IVAO overlay or chart browser has been built or proposed. §1 was revised 2026-09-03 to stop ruling out accounts/sync/a backend, but the feature-scope non-goals in that list are untouched. |

---

## 8. Working with Claude Code

The `CLAUDE.md` template this section originally specified has long since diverged from
the real one — the real `CLAUDE.md` is the source of truth for working conventions now,
not this section, and it's grown a Security section and other rules the M0-era template
never anticipated. Kept here only as a pointer, not duplicated: read `CLAUDE.md` directly.

### Session workflow — current shape, not the original one

The original workflow was one numbered milestone per branch (`feat/m3-simbrief-fetch`),
strictly sequential. That fit a from-scratch build; it stopped fitting once M0–M5 landed
and ongoing work became a set of independent features rather than a strict sequence. The
workflow that replaced it, starting 2026-09-02:

- **One plan, one branch, one doc.** A feature gets designed in a `docs/plans/<name>.md`
  file on its own `plan/<name>` branch before it's built — context, what's been verified
  against real data, an implementation shape, and open questions. See the six current
  plans listed in §10 for the actual shape these take; they're a better reference than a
  description here.
- **Verify before building, still.** M1 and M6's "spike first" rule generalised: for
  anything depending on a real external system whose behaviour isn't documented
  (SimConnect, SimBrief's JSON schema, GSX's receipt files, Navigraph's data), read real
  data or run a throwaway script before designing — don't guess a schema or an API
  contract into a plan doc. `docs/simconnect-notes.md` and `docs/simbrief-notes.md` are
  what this discipline produced; the SimBrief-generation and GSX plans in §10 are recent
  examples of a plan being substantially rewritten after real data corrected a guess.
- Record every surprising sim or third-party-API behaviour in its own `docs/*-notes.md`
  file as you find it — this has repeatedly saved more time than anything else in the
  repo.
- Ask for tests alongside anything touching the phase machine, unit conversions, or
  parsing of third-party data. Those are hard to eyeball and easy to get subtly wrong.

---

## 9. Decisions settled at kickoff

The six decisions this section used to list open are all resolved — recorded in
`docs/decisions.md` §1–§6, kept there rather than duplicated here since that's the file
this section itself designated as the answer log. Summary, in case this document is all
that's open: **Flightdeck**; **Electron + React + TypeScript**; **MSFS 2024 only**;
**saved SimBrief airframe IDs**, not per-request `acdata`; **SI units internally**,
converted at the IPC boundary; **public repo**, licence since changed from the original
MIT to **GPL-3.0-only** (`docs/decisions.md`, 2026-09-03 — see §6 there for why, and for
what changed as a result).

---

## 10. Ongoing plans

Feature work beyond M0–M7 starts as a design doc on its own `plan/<name>` branch, per
§8's workflow, then ships on a matching `feat/<name>` branch once built. `git branch -a`
after fetching is the authoritative list if this table drifts.

**Five of the six branches below were built in one session on 2026-09-03**, the day after
they were planned — a much faster turnaround than the table implies by listing them
individually. Each has its own dated `docs/decisions.md` entry with what shipped and what
was deliberately deferred; read those rather than re-deriving it from a diff.

| Plan | Status | Notes |
|---|---|---|
| SimBrief plan generation (flight number, departure time, cost index) | ✅ Shipped | `docs/decisions.md`, 2026-09-03. Built entirely on the keyless prefill redirect. The same `plan/simbrief-plan-generation` branch later grew a real "Generate…" button once a SimBrief API key existed — see the backend credential-broker row below. |
| Fleet ↔ SimBrief airframe management | ✅ Shipped | `docs/decisions.md`, 2026-09-03. No default-airframe picker (that idea needed scraping an unlicensed page — ruled out post-GPL); a free-text `simbrief_type` column instead. |
| Dispatch advanced options (loads, fuel, cost index, reload a past plan) | ✅ Shipped | `docs/decisions.md`, 2026-09-03. Lives behind an "Advanced (N)" button in the existing card, not a new tab. |
| GSX ground-service invoices in the Logbook | ✅ Shipped | `docs/decisions.md`, 2026-09-03. Opt-in, off by default; snapshots at flight completion rather than reading the folder live. |
| Landing analysis (M6, redesigned) | ✅ Shipped, spike closed | `docs/decisions.md`, 2026-09-03. Capture, storage, and both UI surfaces (Fleet history, Logbook pane, shared severity component) are live. `scripts/spike-landing.ts` was run against a real landing at VHHH the same day: MSFS 2024's dedicated touchdown SimVars disagreed with the derived value not just in magnitude but in trend across a real bounce, so `touchdown_source` stays `'derived'` — settled, not open. |
| Alternate SID/STAR selection | 🔶 Half shipped | `docs/decisions.md`, 2026-09-03. The unblocked half — labelling the SID/STAR segments SimBrief already chose, on the route text and as coloured waypoint pins — is live. Picking a *different* real procedure still needs Flightdeck's own navdata (Navigraph DFD), which needs Navigraph API credentials, applied for and still pending. `plan/sid-star-selection` stays unmerged as the design for that remaining half — not stale, just blocked. |
| Backend credential-broker service (SimBrief signing + Navigraph OAuth) | 🔶 Half shipped | `docs/decisions.md`, 2026-09-03 (scope decision), 2026-09-03 (Navigraph refinement), 2026-09-04 (built and deployed). SimBrief half is live: a new private repo, `flightdeck-backend`, deployed as a Cloudflare Worker (`docs/plans/backend-service.md`), and Dispatch's "Generate…" button (`plan/simbrief-plan-generation`, merged into `main`) calls it end to end — live-verified against a real account. Navigraph half still blocked on confirming Callum's existing developer application actually describes this shape; not built yet. |

None of these are scoped to a deadline. Pick one, read its plan doc in full, verify
anything it flags as unconfirmed against real data before writing code, and follow the
same one-plan-one-PR shape the existing five were built with.
