# Decisions

Answers to the open questions in `PLAN.md` §9. Fill these in during the first Claude
Code session, before scaffolding M0. Add new decisions below as they come up — don't
let them live only in chat history.

## 1. Name

- **Status:** Decided — **Flightdeck**
- Matches the existing repo name. package.json, DB filename (`flightdeck.db`), and
  window title all use it.

## 2. Stack: Electron/TypeScript or .NET/C#?

- **Status:** Decided — **Electron + React + TypeScript**, per PLAN.md's recommendation.
  `node-simconnect` for the sim link (pure TS, no native compile step).

## 3. MSFS 2024 only, or 2020 too?

- **Status:** Decided — **2024 only** for v1. Sim connector stays behind an interface
  so 2020 support can be added later without a rewrite.

## 4. Fleet ↔ SimBrief airframes: saved airframe IDs, or push `acdata` per request?

- **Status:** Decided — **saved airframe ID**. Each fleet aircraft stores its SimBrief
  saved-airframe ID (`simbrief_airframe_id`); dispatch requests reference it in place of
  a type code rather than pushing full `acdata` JSON per request.

## 5. Units: store SI internally and convert at the edges, or store as the sim reports?

- **Status:** Decided — **SI internally** (kg, m, m/s). Convert to aviation units
  (ft, kt, fpm) only at the IPC boundary / UI layer, per CLAUDE.md.

## 6. Licence and repo visibility

- **Status:** Decided — **public repo, MIT licence**. OurAirports data (public domain)
  is fine to vendor; don't copy GPL reference code (e.g. Little Navmap) beyond ideas.

---

## Log

Add a dated entry below whenever a non-trivial decision is made after kickoff, with a
one-line reason. Keeps PLAN.md stable and this file as the changelog of judgment calls.

- 2026-09-01: All six §9 decisions settled at kickoff — see above. No deviations from
  PLAN.md's recommended defaults except confirming public/MIT (was undecided).
- 2026-09-01: Windows confirmed as the primary packaging target, macOS secondary, Linux
  not planned — MSFS itself is Windows-only, so that's where this app actually gets
  used day to day. Added `electron-builder.yml` (NSIS for win, dmg+zip for mac) and
  `.github/workflows/package.yml`, a manually-triggered CI matrix (windows-latest +
  macos-latest) that packages the app and launches the built binary with
  `FLIGHTDECK_SMOKE_TEST=1` (see `src/main/index.ts`) to prove it actually starts, not
  just that electron-builder didn't error. Builds are unsigned on both platforms —
  matches PLAN.md M7 ("unsigned is fine for personal use"); revisit if this ever leaves
  personal use. macOS auto-signing is explicitly disabled (`mac.identity: null`) because
  this repo lives in a OneDrive-synced folder, and OneDrive injects Finder
  metadata/extended attributes that fail `codesign --verify --strict` — cost real time
  to debug, worth remembering if it resurfaces.
- 2026-09-01: Reworded PLAN.md §2 and README.md's SimToolkitPro mentions — now public
  repo (see above), so "modelled on"/"the app you're modelling" reads as more derivative
  than intended. Flightdeck is written independently from scratch; STKP, Volanta and
  Little Navmap are UX/feature comparison points only, not code sources. Little Navmap
  is GPL — ideas from reading it are fine, its code is not (this project is MIT).
- 2026-09-01: Licence/distribution audit ahead of a planned flightsim.to release (free,
  for anyone). Ran `license-checker --production` against the current dependency tree —
  everything actually shipped in the packaged app (electron, react, react-dom,
  better-sqlite3, drizzle-orm) is MIT or Apache-2.0; the SQLite C library itself is
  public domain. No copyleft in the current tree.
  - **node-simconnect (M1) is LGPL-3.0-or-later**, not permissive — flagging now since
    M1 hasn't landed. LGPL is fine for a free, even closed-source app; it does NOT force
    Flightdeck's own code to be LGPL/GPL. Two obligations when M1 adds it: (1) keep it a
    separate, dynamically-`require()`d node_modules dependency rather than letting a
    bundler inline its source into our compiled JS — `externalizeDepsPlugin()` in
    `electron.vite.config.ts` already does this for main/preload, don't remove it; (2)
    ship a NOTICE / "Third-Party Licenses" file with the installer identifying
    node-simconnect as LGPL-3.0-or-later with a link to its source
    (github.com/EvenAR/node-simconnect). Neither is a blocker, both are undone — add the
    NOTICE file as part of M1, not as an afterthought before release.
  - `msfs-simconnect-api-wrapper` (optional wrapper PLAN.md floats evaluating in M1) is
    CC0-1.0 — public domain, no restriction either way.
  - Upcoming stack picks for M4–M6 (MapLibre GL JS: BSD-3-Clause, Recharts/uPlot/
    Zustand/TanStack Query/Tailwind: MIT) are all permissive — checked ahead of time,
    no action needed when they're actually added.
  - Map tiles (M4, still undecided) and a possible SimBrief API key for direct OFP
    generation (M3, optional per §9 decision 4) are usage-terms/ToS concerns, not code
    licensing — not npm dependencies, so `license-checker` doesn't see them. For a
    giveaway app with unpredictable adoption: prefer a tile source with no shared quota
    to blow through (OpenFreeMap, or self-hosted PMTiles) over a shared MapTiler/Stadia
    key. If a personal SimBrief API key is ever requested from Navigraph, its use-case
    description needs to cover "used by many people via a public free app," not personal
    use — don't bake a personally-issued key into a public build without that. The free,
    keyless `xml.fetcher.php?username=` fetch (each user supplies their own SimBrief
    username) has no such issue and should stay the default.
  - Not a code-licensing issue, but relevant to the same release: flightsim.to's own
    Terms of Service (the content-license grant over what you upload) caused a developer
    boycott in 2023; they revised it afterwards to disclaim ownership of uploads. Worth
    re-reading flightsim.to's current ToS directly before the actual upload, not just
    trusting this note.
  - Naming: flightsim.to already runs a first-party product called "FlightDeck —
    Creators Analytics" (creators.flightsim.to). Same name, same platform — consider a
    more specific title for the flightsim.to _listing_ itself (e.g. "Flightdeck — Fleet
    & Logbook Companion") to avoid confusion; doesn't require renaming the repo/package.
  - General MSFS-addon norm, not verified against flightsim.to's specific wording: don't
    use Microsoft/Asobo logos or MSFS box art as the app icon, and carry a brief "not
    affiliated with or endorsed by Microsoft or Asobo Studio" disclaimer before public
    release.
- 2026-09-01: Callum asked that plans for future monetization (subscription + cloud
  storage, raised the same day) not be visible on the public repo. The notes on what
  that would actually require still exist, kept as `docs/future-monetization.md`
  locally — deliberately untracked (see `.gitignore`), never to be committed. A prior
  commit had briefly added that file and a one-line pointer in PLAN.md's non-goals
  section; both were removed by resetting `main` to before that commit and
  force-pushing, so it isn't recoverable from the public commit history either. If
  you're a future session and can see this note but not the file, that's expected —
  ask Callum for the content rather than reconstructing it, and don't recreate it as a
  tracked file.
- 2026-09-01: M3 dispatch — the SimBrief OFP JSON schema isn't documented anywhere
  official (Navigraph's dev portal covers the endpoint, not the response shape), so
  verified it against one real fetch (`xml.fetcher.php?username=...&json=1`) before
  writing `src/main/simbrief/simbrief-client.ts`, same rigor as M1's SimConnect spike.
  Two things worth knowing for later milestones that touch OFP data: every numeric field
  in the response is a JSON _string_, and `params.units` (`'kgs'` or `'lbs'`) depends on
  the SimBrief user's own profile setting — weight/fuel figures are in whichever one
  that is, not a fixed unit. Also confirmed decision #4's assumption: a saved airframe's
  Internal ID (`simbrief_airframe_id`, format `123456_1582090020`) is used via SimBrief's
  own `airframe=` URL parameter, both for future direct-generation API calls and for
  pre-filling the `dispatch.simbrief.com` web form.
- 2026-09-01: M4 map tile source (PLAN.md §4, deferred to M4) — **OpenFreeMap**, style
  `https://tiles.openfreemap.org/styles/liberty`. No API key, no published quota, and no
  self-hosting infrastructure to run — the only one of the three options (OpenFreeMap /
  self-hosted PMTiles / a shared MapTiler-Stadia key) that adds zero backend surface,
  matching this app's "no accounts, no backend" rule. MapLibre's default
  `AttributionControl` must stay enabled (don't pass `attributionControl: false`) — that's
  what satisfies OpenFreeMap's required attribution, not something to add manually.
- 2026-09-01: Switched the M4 style from `liberty` to `positron` (same OpenFreeMap host,
  no other setup change) after live-testing the map against a real flight — `liberty`'s
  full-colour OSM styling competed visually with the flight track/marker. `positron` is a
  low-contrast, mostly-grayscale basemap designed for exactly this kind of data overlay.
  An airport-diagram overlay at high zoom (raised in the same conversation, comparing to
  SimToolkitPro) is a separate, much bigger feature — needs its own chart/diagram data
  source — and is deliberately out of scope for M4.
- 2026-09-01: Retuned `FlightRecorder`'s track-point downsampling after live-testing
  against a real flight: cruise goes from PLAN.md §5's "every 15s" to every 5s, and climb
  gets its own 2s interval (was the 1s default shared with the ground phases). The
  marker/camera interpolation added earlier the same session (to hide the jump between
  sparse cruise points) was briefly removed on the assumption tighter intervals would make
  a plain snap-to read smoothly on its own — live-tested and still visibly jumpy even at
  5s, so it went back in. `TrackView.tsx` keeps the interpolation regardless of how tight
  the recording interval ends up being.
  Also: `descent` can now transition back to `cruise` on a sustained level-off (mirroring
  the existing `climb` → `cruise` check), not just forward to `landing` on touchdown. A
  routine flight-level change sustains a descent rate for well over
  `DESCENT_SUSTAIN_SAMPLES` too, so without this the recorder would commit a flight to
  "descent" — and its 1s-interval, high-precision recording — for the rest of the flight
  after the first step-down, long before any real approach.
- 2026-09-01: Fleet aircraft-add now offers a registration lookup plus a manual type
  search, instead of typing every field by hand. Two data sources, both keyless/free —
  same "no accounts, no backend" reasoning as OpenFreeMap (M4) and SimBrief's
  username-based fetch (M3):
  - **Registration lookup**: [adsbdb](https://github.com/mrjackwills/adsbdb) — no API key,
    no documented rate limit, 262-star actively-maintained open-source public API.
    Verified live (not assumed from docs) against a real registration from the user's own
    imported fleet: `GET https://api.adsbdb.com/v0/aircraft/G-XWBS` returns type,
    icao_type, and registered_owner; an unrecognised/fictional registration returns a
    plain 404 (verified). Its terms require attribution for aircraft data ("PlaneBase") —
    shown as a small credit line in the Fleet form, same treatment as OpenFreeMap's
    required `AttributionControl`.
  - **Manual type search fallback**: vendored
    [ColtJD45/icao-aircraft-designator-list](https://github.com/ColtJD45/icao-aircraft-designator-list)
    (MIT, sourced from ICAO Doc 8643) as `resources/icao-aircraft-types.csv` — verified
    the real file (7389 rows, 7 consistent columns, no quoted fields) before vendoring.
    Bundled into the main-process bundle via Vite's `?raw` import (same mechanism M4 used
    for the maplibre worker URL) rather than a runtime filesystem read, so it works
    identically in dev and packaged builds with no `extraResources` handling needed. This
    is the first use of the "vendor a reference CSV" pattern — PLAN.md's M6 (OurAirports)
    will reuse the same approach. Parsed/searched entirely in the main process
    (`aircraft-lookup/icao-types.ts`) and exposed via a typed IPC search channel, per
    CLAUDE.md's "renderer never touches the filesystem" rule — not shipped to the
    renderer for client-side filtering, even though the file is small enough that would
    have worked technically.
    Both fill blank form fields only, never overwrite something already typed — the
    registration lookup can fill several fields at once (icaoType/name/operator) so it must
    not clobber an in-progress edit; a type-search pick is a single explicit choice so it
    sets icaoType/wakeCat directly once selected.
- 2026-09-01: Fleet simplified to identity + linkage only — registration, ICAO type,
  airline (operator), SimBrief profile (simbriefAirframeId), current ICAO. Dropped every
  performance/status field (name, livery, weights, equip/transponder/PBN/wake cat,
  totalHours/totalCycles, isActive, notes) via a real column-drop migration
  (`drizzle/0004_sparkling_screwball.sql`) — performance data belongs in the linked
  SimBrief profile, not duplicated here; totalHours/totalCycles were already dead columns
  (FleetStats computes live from flight history, nothing wrote to them). Real data loss
  on the dropped columns for the existing fleet, intentional per Callum's request.
- 2026-09-01: Dispatch rebuilt around aircraft-first planning — pick an aircraft, dep ICAO
  autofills from its `currentIcao` (editable), search/enter a destination, "Plan on
  SimBrief…" opens `dispatch.simbrief.com/options/custom?orig=&dest=&airframe=-or-type=`
  (extended from the airframe-only form M3 already verified live) rather than the bare
  dispatch page. Verified live: the constructed URL responds 200 and SimBrief's own
  `type=`/`airframe=` fallback behavior (no code needed on our side for "use the type's
  default airframe when no profile is set").
  - **Airport search**: vendored a trimmed OurAirports slice (`resources/airports.csv`,
    43,400 rows / 2.4 MB, from the real 12.7 MB/19-column source, kept to rows with a
    4-letter icao_code-or-gps_code and non-closed type, projected to
    icao/name/municipality/iso_country/type). First vendored source with quoted CSV
    fields (`"Total RF Heliport"`) — generalized `db/csv.ts`'s `parseCsvRows` to be
    RFC4180-minimal (quotes, `""` escaping, commas-in-quotes) rather than forking a
    second parser; verified this doesn't change behavior for the two existing quote-free
    sources (logbook CSV, ICAO type list). Same "vendor + Vite `?raw` + main-process-only
    search IPC" pattern as the ICAO aircraft-type list.
  - **`aircraft.currentIcao` now self-updates** on flight completion
    (`flight-repo.ts`'s `completeFlight`, real-time path only — not CSV-imported
    historical flights, which aren't guaranteed chronological) — otherwise the new dep
    autofill would quietly go stale after the first flight.
  - **Track scene auto-preview**: a freshly-planned flight's route and per-waypoint pins
    (new `parseWaypointsFromOfpJson` in `route.ts`, new waypoint circle+label layers in
    `FlightMap.tsx`) now show up in Track immediately — previewing the most recent
    planned flight — rather than only after "Start tracking". Dispatch's save handler
    switches the app to the Track page on success (`App.tsx`'s `onPlanned`). Live-verified
    via a synthetic OFP (RKSI–MOLKA–RJTT) — route line and all three labelled waypoints
    rendered on first load, no "Start tracking" click needed; test flight and a
    test-only `currentIcao` edit were both cleaned up from the dev DB afterward.
  - **SimBrief's real generation API is not a simple REST call.** Confirmed via research
    (Navigraph forum/dev portal): it's a browser-popup widget
    (`simbrief.apiv1.js`/`.php`) meant for websites with a server backend, and the key
    itself is still a manual email request to SimBrief support — not self-service, and
    the signing scheme isn't published. Per Callum's decision: sent the key request (see
    conversation for the drafted email) and shipped this round against the keyless
    `dispatch.simbrief.com` redirect; real in-app generation is a follow-up once a key
    and SimBrief's integration files are actually in hand.
