# SimConnect notes

Anything surprising found while working against a real running sim: SimVar quirks,
units that don't match the SDK docs, aircraft that report garbage, reconnect behaviour,
differences between MSFS 2020 and 2024. Append as you find things — this file is worth
more than any amount of upfront research, because most of this can't be known until
you're actually connected to a running sim.

Format: date, sim version, aircraft (if relevant), what you expected, what happened.

## 2026-09-01 — MSFS 2024 (SimConnect 12.2), Fenix A320 IAE SL, in cruise

First run of `scripts/spike-simconnect.ts` against a real sim, on Windows (it was written
on macOS with no MSFS access). Two real divergences from the plan, plus one library
behaviour worth knowing about:

**`SIM RATE` is not a recognized SimVar in MSFS 2024 — `SIMULATION RATE` is.**
Expected: `SIM RATE` (from PLAN.md §6's list) to return the current sim rate.
Actual: `addToDataDefinition` for `SIM RATE`/`number` raised a `NAME_UNRECOGNIZED`
exception, and the follow-up `requestDataOnSimObject` on that same definition then raised
`UNRECOGNIZED_ID`. Confirmed by isolating candidates in their own data definitions
against the live sim: `SIMULATION RATE` (unit `number`, case-insensitive) returns `1`
correctly; `SIM RATE` fails every time. `scripts/spike-simconnect.ts` now uses
`SIMULATION RATE`. Everything else in PLAN.md §6's initial SimVar list (with the
already-known `BRAKE PARKING POSITION` word-order fix) round-trips correctly, including
the string fields (`ATC ID`, `ATC MODEL`, `TITLE`) and the two boolean-as-INT32 fields
(`SIM ON GROUND`, `ENG COMBUSTION:1`, `BRAKE PARKING POSITION`, `IS SLEW ACTIVE`).

**A `RECV_EXCEPTION`'s `index` field is not the position of the failing SimVar in your
data-definition array — don't assume it is.** The original spike's exception handler
logged `recvException.index` on the assumption a human could map it straight back to
`SIM_VARS[index]`. In practice, for the same `SIM RATE` failure above, `index` came back
as `2` every time regardless of where in a 26-entry (or 9-entry, in an isolated retest)
list the bad var actually sat — it looks like a parameter-slot index into the specific
`SimConnect_AddToDataDefinition` call, not a position in a client-side array. `sendId` is
the useful field instead: it's a monotonically increasing counter of packets sent since
connection open, so `sendId` order matches call order and can be used to identify which
`addToDataDefinition` call a given exception belongs to — but the most reliable method,
and the one actually used to find the `SIM RATE` bug, was isolating the suspect SimVar in
its own data definition (own `DEFINITION_ID`/`REQUEST_ID`) and retesting against the live
sim rather than trying to decode the exception fields.

**One bad SimVar name in a shared data definition corrupts the whole read, not just that
field.** When `SIM RATE` failed to register, the subsequent `simObjectData` handler still
fired (SimConnect keeps sending data for the fields that did register), but the response
buffer no longer matches the fixed-order sequential `readFloat64()`/`readString32()` calls
the script assumed — it ran 8 bytes past the end of the buffer and threw a `RangeError`,
crashing the whole process instead of just failing to read one field. Worth remembering
for `SimConnectService`: a single typo'd or since-removed SimVar name shouldn't be able to
take down live tracking for every other field. `IS SLEW ACTIVE` did work as named.

**SimConnect accepts metric unit strings directly — request SI units from the sim rather
than converting client-side.** `INDICATED ALTITUDE` in `meters`, `AIRSPEED
INDICATED`/`VERTICAL SPEED` in `meters per second`, and `TOTAL WEIGHT` in `kilograms` all
round-trip correctly against the live sim. `SimConnectService` (src/main/sim) uses these
directly, so the main process only ever holds SI values and no client-side unit maths is
needed there — per docs/decisions.md §5, conversion to aviation units for display happens
in the renderer instead (see `App.tsx`).

**Named-pipe autodetection needs the sim's SimConnect endpoint to already be up.** The
very first spike run (before MSFS had fully reached a flight/cruise state) failed with
`ECONNREFUSED` on `localhost:2048` — `node-simconnect`'s autodetection order is: local
`SimConnect.cfg` → home-dir `SimConnect.cfg` → local named pipe
(`\\.\pipe\Microsoft Flight Simulator\SimConnect`) → registry port → hardcoded fallback
port `2048`. No `SimConnect.cfg` exists on this machine and the
`HKCU\Software\Microsoft\Microsoft Games\Flight Simulator` registry key it also checks
doesn't exist for this MSFS 2024 install, so it fell through to the `2048` TCP fallback,
which nothing was listening on. Once the sim had been running longer (the named pipe
existed — confirmed directly via `fs.access`), a fresh run connected immediately over the
pipe. Not itself a bug to fix, but `SimConnectService`'s retry/backoff loop (already in
the spike) needs to keep this in mind: a sim that's still loading is indistinguishable
from "not running yet" over the first few retries, and that's expected, not an error
worth surfacing to the user immediately.
