# Plan: alternate SID/STAR selection

Branch: `plan/sid-star-selection`. **Blocked on Navigraph API credentials** — the
application is in, nothing here can be built until it's granted. Independent of the
SimBrief branches otherwise.

Originally drafted before `docs/simbrief-notes.md` existed; revised here because one of
its three spike items has since been answered outright, and the answer is better than the
plan assumed.

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

Still unverified: **a procedure with a transition.** `sid_trans`/`star_trans` are empty on
all nine stored OFPs, so nothing confirms how a runway or enroute transition appears in
either `general` or the navlog. It matters because Navigraph's `tbl_sids`/`tbl_stars` are
keyed by `transition_identifier` as well as `procedure_identifier` — so matching a
SimBrief-chosen procedure to a navdata row needs the transition, and overriding one needs
to write it back. Worth capturing one OFP with a transition before building the matching
logic; a US arrival is the easiest way to get one.

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

Log findings in a new `docs/navdata-notes.md`, mirroring the other two notes files.

## Implementation

### 1. Route segmentation (no Navigraph needed)

- Extend `route.ts` to derive `{sid, enroute, star}` segments from the navlog using
  `is_sid_star` + `stage` + `via_airway`, with `general.sid_ident`/`star_ident` as the
  authoritative names.
- Dispatch's existing "Route" section labels the three segments. The Track map can
  optionally style the procedure portions differently.
- Pure function, unit-tested against a trimmed real navlog fixture.

### 2. Navdata sync (main process)

- New `src/main/navdata/`: OAuth device-flow login (refresh token in the existing
  `app_setting` key/value table — no new table needed), a package-sync check on app start
  comparing local cycle/revision against the packages endpoint, and download-and-verify
  (SHA256 per Navigraph's manifest) into `app.getPath('userData')`.
- Import the package's `tbl_sids`/`tbl_stars` into `flightdeck.db` via a Drizzle
  migration — one row per leg: airport ICAO, procedure identifier, transition identifier,
  seqno, waypoint ident/lat/lon, altitude restrictions. Replace wholesale on every
  successful sync rather than diffing — the same boring, working shape as the existing CSV
  import paths, just triggered by a sync check instead of a file picker.
- New IPC channels (`src/shared/ipc.ts`, handlers in `src/main/index.ts`, exposed via
  `src/preload/index.ts`): `navdataSyncStatus`, `navdataListSids(icao)`,
  `navdataListStars(icao)` returning `{identifier, transition}[]`, and
  `navdataGetProcedureWaypoints(icao, kind, identifier, transition)`.

### 3. Route model: chosen procedure separate from the raw OFP

- `ofpJson` stays untouched, per PLAN.md §5 — never mutated in place.
- Add nullable `selected_sid_id`/`selected_star_id` to `flight` via a migration (null =
  "use whatever SimBrief picked"), with equivalents on `DispatchOfp` for the pre-save
  state in `App.tsx`.
- A new pure `applyProcedureOverride` alongside `route.ts` takes the parsed navlog, the
  segment boundaries from (1), and an optional override's waypoints, and returns the final
  ordered route. `TrackView.tsx` and `LogbookView.tsx` already re-derive the route from
  `ofpJson` reactively on every render — there's no cached route anywhere — so routing
  those call sites through this function makes the override apply everywhere for free.

### 4. Dispatch UI

- Two `Select` dropdowns in the flight-details card (same shadcn `Select` as the
  fleet-aircraft picker), "Departure SID" / "Arrival STAR", populated from the navdata IPC,
  defaulting to "SimBrief default" (null). Changing either updates the lifted `ofp` state
  in `App.tsx` — no network round-trip, no SimBrief re-fetch, purely local recompute.

## Verification

- Unit tests for the segmentation function (1) and `applyProcedureOverride` (3): no
  override (passthrough), SID-only, STAR-only, both — synthetic fixtures plus one trimmed
  real navlog.
- Unit tests for the navdata import against a small synthetic SQLite fixture, mirroring
  how `logbook-import.test.ts` tests file import without real user files.
- `npm run typecheck && npm run lint && npm test`, then live: pick a real airport pair,
  override the SID, confirm Dispatch's route text and the Track map both reflect it, and
  that reverting to "SimBrief default" restores the original.

## Sequencing

Given the Navigraph block, the sensible order is: ship route segmentation (1) on its own
first — it's independent, verified, and delivers half the ask — then do the navdata work
when credentials land.
