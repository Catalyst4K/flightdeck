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
    more specific title for the flightsim.to *listing* itself (e.g. "Flightdeck — Fleet
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
