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
