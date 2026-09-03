# Plan: alternate SID/STAR/runway/transition selection

Branch: `plan/sid-star-selection`. **Blocked on Navigraph API credentials** — the
application is in, nothing here can be built until it's granted. Independent of the
SimBrief branches otherwise.

Originally drafted before `docs/simbrief-notes.md` existed; revised once when one of its
three spike items got answered outright (see "Answered" below), and revised again
2026-09-03 to widen the scope: departure/arrival **runway** and the SID/STAR
**transition** are now first-class, separately-selectable things too, not just SID/STAR —
and all four (SID, STAR, transition, runway) need to actually render on the map, not just
be selectable in a dropdown. See "Scope widened" below for what that changes.

## Scope widened (2026-09-03): runway and transition are peers of SID/STAR

Everything below this point was written for "SID and STAR, selectable" specifically.
Read `sid`/`star` in the rest of this doc as shorthand for all four things now in scope —
**departure runway, SID, transition, arrival runway, STAR** — unless a section says
otherwise. The segmentation, override, and map-rendering machinery generalizes to all
four the same way; nothing about the *shape* of the plan changes, just the count of
selectable things and what a "segment" is keyed on.

**A simpler, unblocked alternative was considered and explicitly rejected for runway.**
`docs/simbrief-notes.md` already confirms `origrwy`/`destrwy` are real, working SimBrief
generation-input parameters (echoed back in every OFP's `api_params`, and used to force a
specific runway when generating one of the reference OFPs this project's notes are built
from) — meaning a *regenerate-via-SimBrief* runway picker (pass the chosen runway to a
fresh Generate call, let SimBrief pick a runway-appropriate procedure itself) is buildable
today, no Navigraph needed. **Callum chose to wait for the full Navigraph-backed local
override instead**, for consistency with how SID/STAR already work in this plan — a
runway change should feel the same as a SID/STAR change (instant, local, no round-trip to
SimBrief, works from data Flightdeck already has cached), not a different mechanism for
one of four peer selectors. Noted here so this shortcut isn't rediscovered and second-
guessed later: it was seen, and deliberately not taken.

## Context

Dispatch shows whatever route SimBrief generated, with the SID and STAR baked invisibly
into the middle of one route string and one navlog. There's no way to see where the
procedure boundaries are, and no way to swap one out. In practice that matters often:
SimBrief auto-picks based on preferences, but ATC frequently assigns something else at
clearance or on descent.

Two things wanted: (1) see the SID and STAR as distinct, labelled segments, and (2) pick a
different, real, currently-valid procedure from a dropdown, with the route and the Track
map updating to match.

A dropdown of *real, valid* procedures means Flightdeck needs its own procedure data.
SimBrief can regenerate a route from free-text input but will never hand back a list of
valid SID/STAR names, and has no "swap just this procedure" call. MSFS 2024's own navdata
was considered first (no account needed, exactly what the sim flies) but community reports
of missing/inconsistent SID/STAR data on default aircraft, plus a likely proprietary
on-disk format, made it too risky to commit to untested.

## Decision: Navigraph Digital Flight Data (DFD)

Confirmed via developers.navigraph.com: `tbl_sids`/`tbl_stars` carry
`procedure_identifier`, `transition_identifier`, `seqno`, `waypoint_identifier`,
`waypoint_latitude`/`_longitude`, `path_termination`, `altitude1`/`altitude2` — enough to
reconstruct a real, flyable procedure. Delivery is package-based: a full SQLite file per
AIRAC cycle (~28 days), downloaded then queried locally. That fits the local-first
architecture well — the same shape as the existing OurAirports import, just re-synced
periodically rather than vendored once.

**This is a deliberate, explicit exception to CLAUDE.md's "no accounts" rule**, made
knowingly. Two account-shaped costs to go in eyes-open:

1. Developer API registration is free, but the *data* only stays current while a Navigraph
   subscription (~$12/mo, Navigation Data or Ultimate) is active. Without one, the API
   serves a stale AIRAC package — which for dispatch use is actively wrong, not merely
   missing a feature.
2. Auth is OAuth2 Device Authorization Flow with PKCE — the right flow for a desktop app
   (the shape the GitHub CLI uses), but it means token storage and refresh logic that
   nothing else in this app currently needs.

Record the exception as its own dated entry in `docs/decisions.md` once implemented.

## Spike status

### Answered — the SimBrief side is done

The original plan's third spike item was "confirm how a SID/STAR's waypoints splice into
the existing route", relying second-hand on a third-party interface claiming
`navlog.fix[]` carries an `is_sid_star` field. **That is now verified first-hand** against
a real stored OFP (`docs/simbrief-notes.md`), and SimBrief gives more than expected:

| Field | Confirmed value | Use |
| --- | --- | --- |
| `navlog.fix[].is_sid_star` | `"1"` / `"0"` | Marks procedure legs vs enroute legs. |
| `navlog.fix[].via_airway` | `"DET2G"` on procedure legs | Names *which* procedure the leg belongs to. |
| `navlog.fix[].stage` | `"CLB"` / `"CRZ"` / `"DSC"` | Separates departure from arrival procedure without reasoning about array position. |
| `general.sid_ident`, `sid_trans`, `star_ident`, `star_trans` | `"DET2G"`, else `{}` | SimBrief states its chosen procedures outright. |

So boundary detection needs no inference at all — the SID name is stated in `general`, and
each leg says whether it belongs to a procedure and which one. **The "label the route as
SID / enroute / STAR" half of this feature is therefore not blocked on Navigraph and could
ship on its own**, which is worth considering: it's the smaller half, it delivers the
"see them as distinct segments" ask, and it's implementable today.

Since verified further against a stored EGLL→VHHH OFP that has **both** a SID (`BPK7F`)
and a STAR (`SIER7B`) — the arrival side behaves identically. Two edge cases came out of
it that the segmentation function must handle, both detailed in `docs/simbrief-notes.md`:

- **Segment on `via_airway` + `stage`, not on `is_sid_star` alone.** The waypoint a SID
  terminates at — `BPK`, the navaid the BPK7F is named after — has `is_sid_star: "0"` but
  `via_airway: "BPK7F"`. Filtering on the flag leaves a one-waypoint gap and splits the
  route one fix early.
- **The destination airport is itself a fix inside the STAR segment** (`VHHH`,
  `is_sid_star: "1"`). Don't assume every procedure fix is an enroute-style waypoint.

**Transitions are now verified too**, via an OFP generated specifically to produce them
(KLAX→KJFK: `sid_ident` `DOTSS2` / `sid_trans` `CLEEE`, `star_ident` `PUCKY1` /
`star_trans` `WLKES`). They matter because Navigraph's `tbl_sids`/`tbl_stars` are keyed by
`transition_identifier` as well as `procedure_identifier`, so matching a SimBrief-chosen
procedure to a navdata row needs the transition, and overriding one needs to write it back.

They do not appear in the navlog the way this plan originally assumed. Full detail in
`docs/simbrief-notes.md`; the two facts that determine the segmentation function:

- **A transition never gets its own `via_airway`.** The name exists only in
  `general.sid_trans`/`star_trans`.
- **The two ends are not symmetric.** The SID's handoff fix (`CLEEE`) carries
  `via_airway` = the SID, so `via_airway` finds the SID's full extent. The STAR's handoff
  fix (`WLKES`) carries `via_airway` = the **inbound enroute airway** (`Q476`), not the
  STAR — so `via_airway` alone does *not* find where the STAR begins.

Both handoff fixes are `is_sid_star: "0"`, which generalises the earlier `BPK` observation:
the fix a procedure hands off at is always flagged `"0"`, transition or not.

### The segmentation rule to implement

Verified against all three shapes now on hand — with transitions, with procedures but no
transitions, and with a SID but no STAR:

- **SID** = fixes from the start while `via_airway === general.sid_ident`. Correctly
  includes the handoff fix in both the transition case (`CLEEE`) and the no-transition
  case (`BPK`).
- **STAR** = from the fix whose `ident === general.star_trans` when non-empty, else from
  the first fix with `via_airway === general.star_ident`; runs to the last fix (which is
  the destination airport itself, `type: "apt"`). Starting at `star_trans` is what keeps
  the segments contiguous instead of leaving the entry fix stranded in the enroute segment.
- **Enroute** = everything between.
- All four `general` fields are `{}` when absent, not `""` — guard accordingly.

Unit-test it against all three: a full SID+transition/STAR+transition route, a
SID/STAR-without-transitions route, and a SID-only route with no STAR.

One more thing the fixtures surfaced: **`TOC` and `TOD` are navlog entries**, with
`type: "ltlg"` and `via_airway: "DCT"`. They fall in the enroute segment and are computed
points rather than fixes, so the segmentation function should leave them alone — but
anything labelling waypoints off this array renders them, which `route.ts` already does
today.

Note the `{}` trap when reading `sid_ident`/`star_ident` — an absent procedure comes back
as an empty object, not an empty string, and the existing `str()` helper would turn that
into `"[object Object]"`. See `docs/simbrief-notes.md`.

### Still outstanding — the Navigraph side

Before writing production code, and only once credentials exist:

1. **Confirm the OAuth device flow end to end** from a throwaway `scripts/` script — token
   issuance, refresh, and what the packages endpoint returns for Callum's account (current
   vs stale package, confirming the subscription behaviour is as documented).
2. **Download one real DFD package and inspect `tbl_sids`/`tbl_stars` directly** for a
   couple of airports Callum actually flies. Confirm the table and field names above are
   real — they came from a docs fetch that flagged the table-name summary as slightly
   uncertain, and DFD schemas can drift between versions — and confirm a full procedure
   (all legs, a runway transition, altitude restrictions) walks start to finish into an
   ordered waypoint list.
3. **Runway data (new, scope-widened item)**: identify and inspect DFD's runway table
   (likely `tbl_runways` — unconfirmed, same "verify, don't trust the docs fetch"
   discipline as item 2) for a couple of the same airports — threshold lat/lon, heading,
   length, and however it links to `tbl_sids`/`tbl_stars` (many real-world procedures are
   runway-specific, e.g. valid only off certain runways/transitions). Confirm whether
   picking a runway should filter the SID/STAR dropdowns to only what's actually valid off
   it, or whether that's a v2 refinement — don't assume either way before seeing real data.

Log findings in a new `docs/navdata-notes.md`, mirroring the other two notes files.

## Implementation

### 1. Route segmentation (no Navigraph needed)

- Extend `route.ts` to derive `{departureRunway, sid, enroute, star, arrivalRunway}`
  segments from the navlog using `is_sid_star` + `stage` + `via_airway`, with
  `general.sid_ident`/`star_ident` (and `sid_trans`/`star_trans` for the transition) as
  the authoritative names, and `api_params.origrwy`/`destrwy` (confirmed real field,
  `docs/simbrief-notes.md`) for the two runways.
- Dispatch's existing "Route" section labels all the segments, not just SID/enroute/STAR.
- Pure function, unit-tested against a trimmed real navlog fixture.

### 2. Navdata sync (main process)

- New `src/main/navdata/`: OAuth device-flow login (refresh token in the existing
  `app_setting` key/value table — no new table needed), a package-sync check on app start
  comparing local cycle/revision against the packages endpoint, and download-and-verify
  (SHA256 per Navigraph's manifest) into `app.getPath('userData')`.
- Import the package's `tbl_sids`/`tbl_stars`, plus whatever the runway table turns out to
  be (see "Still outstanding" item 3), into `flightdeck.db` via a Drizzle migration — one
  row per leg: airport ICAO, procedure identifier, transition identifier, seqno, waypoint
  ident/lat/lon, altitude restrictions; and one row per runway: airport ICAO, ident,
  threshold lat/lon, heading, length. Replace wholesale on every successful sync rather
  than diffing — the same boring, working shape as the existing CSV import paths, just
  triggered by a sync check instead of a file picker.
- New IPC channels (`src/shared/ipc.ts`, handlers in `src/main/index.ts`, exposed via
  `src/preload/index.ts`): `navdataSyncStatus`, `navdataListRunways(icao)`,
  `navdataListSids(icao, runway)`, `navdataListStars(icao, runway)` returning
  `{identifier, transition}[]` (filtered by runway only if item 3's live check confirms
  that link exists and is worth enforcing), and
  `navdataGetProcedureWaypoints(icao, kind, identifier, transition)`.

### 3. Route model: chosen procedure separate from the raw OFP

- `ofpJson` stays untouched, per PLAN.md §5 — never mutated in place.
- Add nullable `selected_dep_runway`/`selected_sid_id`/`selected_sid_transition`/
  `selected_star_id`/`selected_star_transition`/`selected_arr_runway` to `flight` via a
  migration (null = "use whatever SimBrief picked" for each, independently — choosing a
  runway doesn't force a SID/STAR choice too, and vice versa), with equivalents on
  `DispatchOfp` for the pre-save state in `App.tsx`.
- A new pure `applyProcedureOverride` alongside `route.ts` takes the parsed navlog, the
  segment boundaries from (1), and any of the six optional overrides' waypoints, and
  returns the final ordered route. `TrackView.tsx` and `LogbookView.tsx` already re-derive
  the route from `ofpJson` reactively on every render — there's no cached route anywhere —
  so routing those call sites through this function makes every override apply everywhere
  for free.

### 4. Dispatch UI

- Six `Select` dropdowns in the flight-details card (same shadcn `Select` as the
  fleet-aircraft picker): "Departure runway", "SID", "SID transition", "Arrival runway",
  "STAR", "STAR transition" — populated from the navdata IPC, each defaulting to "SimBrief
  default" (null) independently. Changing any one updates the lifted `ofp` state in
  `App.tsx` — no network round-trip, no SimBrief re-fetch, purely local recompute. If
  item 3's live check confirms runway constrains which SIDs/STARs are valid, changing the
  runway dropdown filters (not clears) the SID/STAR options rather than silently
  invalidating a selection the pilot already made.

**Layout shipped ahead of schedule, 2026-09-03** — the six dropdowns exist today, in their
own "Procedures" card under the "Plan a flight" card (`DispatchView.tsx`), autofilled from
`parseRouteProcedures` (extended to also read `sid_trans`/`star_trans` and
`api_params.origrwy`/`destrwy`) each time a new OFP comes in. **Each is still a single,
disabled-until-populated option** — there is no alternate-procedure data source yet, so
"changing" one currently means nothing beyond what's already selected. This is the layout
half of this section only; the navdata-backed real alternatives, the filter-by-runway
behaviour, and routing the selection through `applyProcedureOverride` (§3) are still
blocked on Navigraph credentials as below. The inline SID/STAR badges that used to sit in
the OFP card's Route section were removed in the same change, now that this card is where
they live.

### 5. Map rendering (all four/six segments, not just a route line)

Currently `FlightMap.tsx` draws one undifferentiated route line (plus, since the
SimBrief-generation-spike work, labelled waypoint pins — see `docs/decisions.md`'s
simbrief-plan-generation entries for that groundwork). This plan needs the map to show
**which part of the route is which**, not just where it goes:

- Style the route line differently per segment (departure runway ground track/SID/
  enroute/STAR/arrival runway ground track) — distinct colors or dash patterns, extending
  `FlightMap.tsx`'s existing `planned-route` GeoJSON source/layer rather than adding a
  second rendering path.
- Runways themselves should render as more than a route-line endpoint: the actual
  threshold-to-threshold geometry (from the navdata runway table, item 3), so a runway
  change is visibly a different physical strip, not just a differently-worded label.
- Waypoint pins (already built) should distinguish a transition fix from an ordinary
  procedure fix if that's visually meaningful once real navdata is in hand — a nice-to-
  have, not a blocker; decide once real procedure geometry is on screen and it's clear
  whether the distinction is actually useful to see.
- Applies everywhere the route already renders reactively from `ofpJson` — Track's live
  map and any preview state — via the same `applyProcedureOverride` output from (3), not
  a separate code path per view.

## Verification

- Unit tests for the segmentation function (1) and `applyProcedureOverride` (3): no
  override (passthrough), and every combination of the six overrides set/unset that's
  practical to enumerate — synthetic fixtures plus one trimmed real navlog.
- Unit tests for the navdata import (procedures and runways) against a small synthetic
  SQLite fixture, mirroring how `logbook-import.test.ts` tests file import without real
  user files.
- `npm run typecheck && npm run lint && npm test`, then live: pick a real airport pair,
  override the SID and the departure runway, confirm Dispatch's route text and the Track
  map both reflect it (including the map's per-segment styling and real runway geometry),
  and that reverting each override independently to "SimBrief default" restores just that
  part of the original route.

## Sequencing

Given the Navigraph block, the sensible order is: ship route segmentation (1) — now
covering runway/transition segments too, still independent of Navigraph and verified via
already-confirmed OFP fields (`origrwy`/`destrwy`, `sid_trans`/`star_trans`) — on its own
first, then do the navdata sync, override model, Dispatch UI, and map rendering (2–5)
together once credentials land, since none of those four make sense shipped separately
from each other.
