# Decisions

Answers to the open questions in `PLAN.md` §9. Fill these in during the first Claude
Code session, before scaffolding M0. Add new decisions below as they come up — don't
let them live only in chat history.

## 1. Name
- **Status:** TBD
- Working title in PLAN.md is "Flightdeck". Confirm or replace, then update PLAN.md,
  package.json, DB filename, and window title together.

## 2. Stack: Electron/TypeScript or .NET/C#?
- **Status:** TBD (PLAN.md recommends Electron + React + TS)

## 3. MSFS 2024 only, or 2020 too?
- **Status:** TBD

## 4. Fleet ↔ SimBrief airframes: saved airframe IDs, or push `acdata` per request?
- **Status:** TBD

## 5. Units: store SI internally and convert at the edges, or store as the sim reports?
- **Status:** TBD (PLAN.md leans SI internally, converted at the IPC boundary)

## 6. Licence and repo visibility
- **Status:** TBD

---

## Log

Add a dated entry below whenever a non-trivial decision is made after kickoff, with a
one-line reason. Keeps PLAN.md stable and this file as the changelog of judgment calls.

<!-- - 2026-XX-XX: <decision> — <reason> -->
