# SimBrief notes

Companion to `docs/simconnect-notes.md`, for the same reason: SimBrief's JSON schema is
not documented anywhere, so everything trusted about it has to be confirmed against a
real response. `src/main/simbrief/simbrief-client.ts`'s header comment covers what M3
verified; this file collects what's been confirmed since, including fields nothing in the
app reads yet but planned work depends on.

**Reference response** for everything below unless stated otherwise: a real OFP fetched
2026-09-02 — BAW02 EGLL→WSSS, A388, AIRAC 2608, `params.request_id` 184931499, 2.7 MB of
JSON, stored as `flight.ofp_json` for flight id 166 in the dev database. Read directly
out of the DB rather than re-fetched, so these are the exact bytes the app already stores.

## Top-level sections

```
fetch, params, general, origin, destination, alternate, alternate_navlog, takeoff_altn,
enroute_altn, enroute_station, navlog, etops, tlr, atc, aircraft, fuel, fuel_extra,
times, weights, impacts, crew, notams, weather, sigmets, text, tracks, database_updates,
files, fms_downloads, images, links, prefile, vatsim_prefile, ivao_prefile,
pilotedge_prefile, poscon_prefile, apoc_prefile, isfp_prefile, map_data, offset_data,
offset_length, api_params
```

## Empty values come back as `{}`, not `""` or null

The biggest trap in this schema, and the one most likely to bite new field reads. The
JSON is generated from SimBrief's XML, and an empty XML element deserializes to an empty
**object**, not an empty string. Confirmed instances in the reference response:

| Field | Value |
| --- | --- |
| `general.star_ident`, `general.star_trans`, `general.sid_trans` | `{}` |
| `params.static_id` | `{}` |
| `aircraft.selcal` | `{}` |
| `api_params.fl`, `api_params.selcal`, `api_params.static_id`, `api_params.acdata` | `{}` |

`simbrief-client.ts`'s `str()` helper is `String(value ?? '')`, which turns `{}` into the
literal string `"[object Object]"`. It happens to be safe for every field it's currently
applied to (all of those are populated in practice), but **any new optional string field
needs a guard** — check `typeof value === 'string'` and treat anything else as absent,
rather than assuming an absent value arrives as `''` or null.

Same applies to `num()`: `Number({})` is `NaN`, which `num()` throws on. An optional
numeric field that SimBrief leaves empty will throw rather than default.

## Every value is a string

Already noted in `simbrief-client.ts`, repeated here because it interacts with the above:
`"33000"`, `"200"`, `"1"`. Booleans are `"1"`/`"0"`. There are no JSON numbers or
booleans anywhere in the response.

## `general` — confirmed keys

```
release, icao_airline, flight_number, is_etops, dx_rmk, sys_rmk, is_detailed_profile,
cruise_profile, climb_profile, descent_profile, alternate_profile, reserve_profile,
costindex, cont_rule, initial_altitude, stepclimb_string, avg_temp_dev, avg_tropopause,
avg_wind_comp, avg_wind_dir, avg_wind_spd, gc_distance, route_distance, air_distance,
total_burn, cruise_tas, cruise_mach, passengers, route, route_ifps, route_navigraph,
route_track_replace, route_track_removed, sid_ident, sid_trans, star_ident, star_trans
```

Notable, none of which the app reads yet:

- **`costindex`** — `"200"` in the reference response. Plain cost index, no scaling.
- **`sid_ident` / `sid_trans` / `star_ident` / `star_trans`** — SimBrief states the
  procedures it picked *explicitly*, as their own fields. `sid_ident` was `"DET2G"`;
  the other three were `{}` (see above) because this OFP had no SID transition and no
  STAR. This is a much better source for "which SID/STAR did SimBrief choose" than
  parsing the route string.
- **`route_ifps` / `route_navigraph`** — alternate encodings of the same route.
- **`initial_altitude`** — feet, despite the name (`simbrief-client.ts` already converts
  it as feet, verified in M3).

## `navlog.fix[]` — `is_sid_star` is real

Confirmed on the reference response's first fix:

```json
{ "ident": "D270A", "type": "wpt", "stage": "CLB", "via_airway": "DET2G",
  "is_sid_star": "1", "distance": "5", "altitude_feet": "2200", ... }
```

Three fields matter for splitting a route into SID / enroute / STAR:

- **`is_sid_star`** — `"1"` on fixes belonging to a terminal procedure, `"0"` otherwise.
  This confirms the third-party `SimbriefNavlogFix` interface that the SID/STAR plan was
  relying on second-hand; it is now first-hand verified.
- **`via_airway`** — carries the *procedure name* (`"DET2G"`) on procedure legs, and the
  airway on enroute legs. So a SID fix identifies which SID it belongs to.
- **`stage`** — `"CLB"` / `"CRZ"` / `"DSC"`. Distinguishes a departure procedure from an
  arrival one without needing to reason about position in the array.

Each fix also carries a nested `wind_data.level[]` array — part of why the response is
2.7 MB.

## `api_params` — the generation inputs, echoed back

The response includes an `api_params` section containing the parameters the plan was
generated with. Reference response, in full:

```json
{ "airline": "BAW", "fltnum": "02", "type": "A388", "orig": "EGLL", "dest": "WSSS",
  "date": "1788307200", "dephour": "64800", "depmin": "1500",
  "route": "DET2G DET L6 DVR UL9 KONAN ...", "stehour": "43200", "stemin": "0",
  "reg": "N388SB", "fin": "388", "selcal": {}, "pax": "auto", "altn": "WMKK", "fl": {},
  "cpt": "...... .....", "pid": "1191852", "fuelfactor": "1",
  "manualpayload": "auto", "manualzfw": "auto", "taxifuel": "0",
  "minfob": "0", "minfob_units": "wgt", "minfod": "0", "minfod_units": "wgt",
  "melfuel": "0", "melfuel_units": "wgt", "atcfuel": "0", "atcfuel_units": "wgt",
  "wxxfuel": "0", "wxxfuel_units": "wgt", "addedfuel": "0", "addedfuel_units": "wgt",
  "addedfuel_label": "extra", "tankering": "0", "tankering_units": "wgt",
  "flightrules": "i", "flighttype": "s", "contpct": "auto", "resvrule": "auto",
  "taxiout": "20", "taxiin": "8", "cargo": "0", "origrwy": "27L", "destrwy": "20R",
  "climb": "250/320/84", "descent": "85/300/250", "cruisemode": "CI",
  "cruisesub": "auto", "planformat": "lido", "pounds": "0", "navlog": "1", "etops": "1",
  "stepclimbs": "1", "tlr": "1", "notams_opt": "1", "firnot": "1", "maps": "1",
  "turntoflt": {}, ..., "static_id": {}, "acdata": {}, "acdata_parsed": {} }
```

This is what makes "reload the last plan's settings and regenerate" possible without
Flightdeck storing form state separately — it's already inside the raw JSON the app
persists per PLAN.md §5.

**But the echoed names and units are not the input names and units.** Confirmed
mismatches against the documented input parameter list
(developers.navigraph.com/docs/simbrief/using-the-api):

| Documented input | Echoed in `api_params` | Note |
| --- | --- | --- |
| `deph` (hour), `depm` (minute) | `dephour` `"64800"`, `depmin` `"1500"` | **Seconds, not hours/minutes.** 64800 s = 18:00, 1500 s = 25 min → 18:25Z, which matches `times.sched_out` = 1788373500 = 2026-09-02T18:25:00Z. |
| `steh`, `stem` | `stehour` `"43200"`, `stemin` `"0"` | Same seconds encoding (12:00). |
| `notams` | `notams_opt` | Renamed. |
| `units` | `pounds` `"0"` | Different field entirely — a boolean, not a unit name. |
| `manualzfw` | `manualzfw`, plus `manualpayload` | Extra field with no documented input counterpart. |
| `civalue` | `cruisemode` `"CI"`, `cruisesub` `"auto"` | The CI *value* isn't echoed here at all — read `general.costindex` instead. |

So `api_params` must be **translated**, not fed straight back as generation input. Doing
it blindly would send an 18:25 departure as hour 64800.

`"auto"` is a valid value for several fields (`pax`, `manualzfw`, `manualpayload`,
`contpct`, `resvrule`, `cruisesub`) and means "let SimBrief decide" — distinct from `0`.

## `aircraft` — which airframe profile was used

```json
{ "icaocode": "A388", "base_type": "A388", "name": "A380-800", "reg": "N388SB",
  "fin": "388", "equip": "J-SADE2E3FGHIJ3J4J5M1RWXY/LB1D1", "max_passengers": "471",
  "fuelfactor": "1", "internal_id": "A388", "is_custom": "0" }
```

- **`internal_id`** — for a stock type this is just the type code (`"A388"`).
- **`is_custom`** — `"0"` here, since this plan used SimBrief's default airframe for the
  type rather than a saved profile.

**Unverified:** what `internal_id` looks like when `is_custom` is `"1"`. Expected to be
the `123456_1582090020`-style saved-airframe ID that `aircraft.simbrief_airframe_id`
already stores (see `docs/decisions.md`, 2026-09-01), but no OFP generated from a custom
airframe has been inspected yet. Confirm before relying on it to match or backfill a
fleet aircraft's stored profile ID.

## `weights` and `fuel` — full key list

Units follow `params.units` (`"kgs"` or `"lbs"`) — see `simbrief-client.ts`.

```
weights: oew, pax_count, bag_count, pax_count_actual, bag_count_actual, pax_weight,
         bag_weight, freight_added, cargo, payload, est_zfw, max_zfw, est_tow, max_tow,
         max_tow_struct, tow_limit_code, est_ldw, max_ldw, est_ramp

fuel:    taxi, enroute_burn, contingency, alternate_burn, reserve, etops, extra,
         extra_required, extra_optional, min_takeoff, plan_takeoff, plan_ramp,
         plan_landing, avg_fuel_flow, max_tanks
```

`pax_weight` (`"79.379"`) and `bag_weight` (`"24.948"`) are per-passenger figures, and
the `max_*` / `oew` fields give real envelope limits — enough to validate a user-entered
payload against the airframe rather than guessing.

## `times`

```
est_time_enroute, sched_time_enroute, sched_out, sched_off, sched_on, sched_in,
sched_block, est_out, est_off, est_on, est_in, est_block, orig_timezone, dest_timezone,
taxi_out, taxi_in, reserve_time, endurance, contfuel_time, etopsfuel_time,
extrafuel_time
```

`sched_*`/`est_*` are unix epoch seconds (converted to ISO in `simbrief-client.ts`); the
duration fields are seconds.

## Fetching

- Keyless, per-user: `https://www.simbrief.com/api/xml.fetcher.php?username=<name>&json=1`
  — what the app uses today.
- By pilot ID: `...?userid=<pilot id>`. The reference response's `params.user_id` is
  `1191852`, so the ID is available from any fetched OFP.
- **A specific plan rather than the latest:** `...?userid=<id>&static_id=<static id>`,
  where the static ID is one the *generating* request set via the `static_id` input
  parameter. Documented; not yet tried from Flightdeck. This is the mechanism for
  reliably fetching back a plan Flightdeck itself asked for, instead of hoping "latest"
  is still the right one.

## Saved airframes

Saved airframes live only in SimBrief's web UI — there is no API to create, edit or list
them (`docs/decisions.md` §4 covers why Flightdeck references a saved airframe ID rather
than pushing `acdata` per request).

- **The list page** is `https://dispatch.simbrief.com/airframes` (Dispatch → Saved
  Airframes).
- **A single airframe's editor is directly linkable**, by path rather than query
  parameter: `https://dispatch.simbrief.com/airframes/saved/<id>`. Confirmed 200.
- **The path ID is the internal ID's suffix.** Verified against a real airframe of
  Callum's: internal ID `1191852_1763944989305` ↔ URL
  `.../airframes/saved/1763944989305`. So the internal ID is
  `<simbrief user id>_<airframe id>` and the URL takes the part after the underscore.
  Callum's user ID is `1191852`, matching `params.user_id` in his fetched OFPs.

  So deriving the edit URL from a stored `aircraft.simbrief_airframe_id` is
  `id.split('_')[1]` — **treat that suffix as an opaque string, not a timestamp.** It
  happens to look like a millisecond epoch here (1763944989305 = 2025-11-24T00:43:09Z,
  presumably the airframe's creation time), and the older format documented in
  `docs/decisions.md` (`123456_1582090020`) has a 10-digit *seconds* value instead. Since
  the rule is "take the suffix verbatim", that drift doesn't matter — but any code that
  parses, converts or validates it as a date would break on one format or the other.
  Fall back to the plain airframes list if there's no underscore.

**Unverified:** whether a *seconds*-format suffix still resolves under
`/airframes/saved/`. No old airframe has been tried. The fallback to the list page covers
it either way.

## Generation

Unchanged from the 2026-09-01 finding in `docs/decisions.md`: SimBrief's official API is
a browser-popup widget for websites with a PHP backend (`simbrief.apiv1.js` / `.php`),
authenticated with an emailed API key hashed as `md5(api_key . api_req)`, and the pilot
must be logged in to SimBrief in that popup. It is not a REST call a desktop app can make
on its own behalf, and the key request is a manual email to SimBrief support.

What works today with no key at all is the URL prefill the app already uses:
`https://dispatch.simbrief.com/options/custom?orig=&dest=&airframe=`-or-`type=`,
verified live in M3 and again on 2026-09-01.

**Unverified, and worth five minutes before building anything on it:** whether that same
prefill URL accepts the rest of the documented input parameters (`airline`, `fltnum`,
`date`, `deph`, `depm`, `pax`, `cargo`, `civalue`, `static_id`, …). The parameter names
are documented for the *API form*, and the prefill URL is known to accept at least
`orig`/`dest`/`type`/`airframe` from that same set — but "some of the set works" is not
"all of the set works". Test by opening a URL with the extra parameters and checking
whether SimBrief's dispatch form comes up populated.
