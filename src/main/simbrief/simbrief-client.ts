/**
 * SimBrief OFP fetch/parse. Field names and shapes here are verified against a real
 * response from https://www.simbrief.com/api/xml.fetcher.php?username=...&json=1 (not
 * from docs alone, which don't document the JSON schema) — see the M3 commit for the
 * captured example. Two things the docs don't mention but the real response does:
 *
 * - Every numeric value in the JSON is a STRING (e.g. `"33000"`), not a number.
 * - `params.units` is `'kgs'` or `'lbs'` depending on the SimBrief user's own profile
 *   setting — weight/fuel figures are in THAT unit, not a fixed one. Must convert.
 *
 * Times (`times.sched_out` etc.) are unix epoch seconds, converted to ISO 8601 UTC here
 * so the rest of the app never has to know about SimBrief's time format.
 */

const LB_PER_KG = 2.2046226218

export interface SimBriefStepClimb {
  /** Waypoint where the new, higher cruise altitude begins. */
  atIdent: string
  fromAltitudeFt: number
  toAltitudeFt: number
}

export interface SimBriefOfp {
  ofpId: string
  aircraftIcaoType: string
  /** Tail number from the OFP, for auto-matching against a Fleet aircraft — may not match anything. */
  aircraftRegistration: string
  flightNumber: string
  depIcao: string
  arrIcao: string
  altnIcao: string
  routeString: string
  cruiseAltM: number
  schedOutUtc: string
  schedInUtc: string
  fuelPlannedKg: number
  pax: number
  cargoKg: number
  zfwKg: number
  towKg: number
  ldwKg: number
  waypoints: { ident: string; altitudeFt: number; distanceNm: number }[]
  /** Planned mid-cruise altitude increases (see computeStepClimbs) — NOT yet verified
   *  against a real SimBrief response (see the comment on computeStepClimbs below);
   *  flag it if this comes out empty/wrong against a real fetched OFP. */
  stepClimbs: SimBriefStepClimb[]
  /** The full response, stored verbatim per PLAN.md §5 ("Store the raw JSON"). */
  rawJson: string
}

class SimBriefError extends Error {}

function num(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new SimBriefError(`Expected a numeric value, got: ${JSON.stringify(value)}`)
  return n
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

function epochSecondsToIso(value: unknown): string {
  return new Date(num(value) * 1000).toISOString()
}

/**
 * NOT YET VERIFIED against a real SimBrief response — SimBrief's JSON schema isn't
 * documented anywhere (see the file header), and unlike every other field in this file
 * this one hasn't been checked against a live fetch. Best-effort based on how SimBrief's
 * own OFP text output derives its "PLANNED STEP CLIMBS" section: each navlog fix during
 * the cruise phase carries a `stage` field ('CLB'/'CRZ'/'DSC' per public discussion of
 * the schema), and a step climb is wherever cruise altitude increases between two CRZ
 * fixes — deliberately restricted to CRZ-to-CRZ so the initial climb-out and the descent
 * (both naturally monotonic altitude changes too) never get misread as step climbs. If
 * this comes out empty or wrong against a real OFP, `stage` is the thing to re-check.
 */
export function computeStepClimbs(
  fixes: { ident: string; altitudeFt: number; stage: string }[]
): SimBriefStepClimb[] {
  const climbs: SimBriefStepClimb[] = []
  let cruiseAltitudeFt: number | null = null
  for (const fix of fixes) {
    if (fix.stage !== 'CRZ') continue
    if (cruiseAltitudeFt !== null && fix.altitudeFt > cruiseAltitudeFt) {
      climbs.push({ atIdent: fix.ident, fromAltitudeFt: cruiseAltitudeFt, toAltitudeFt: fix.altitudeFt })
    }
    cruiseAltitudeFt = fix.altitudeFt
  }
  return climbs
}

export async function fetchLatestOfp(username: string): Promise<SimBriefOfp> {
  const url = `https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}&json=1`
  const response = await fetch(url)
  const raw: unknown = await response.json().catch(() => undefined)

  if (!response.ok || typeof raw !== 'object' || raw === null) {
    throw new SimBriefError(`SimBrief fetch failed (HTTP ${response.status}) for username "${username}"`)
  }

  const ofp = raw as Record<string, Record<string, unknown> | undefined>
  if (ofp.fetch?.status !== 'Success') {
    throw new SimBriefError(
      `SimBrief reported an error for username "${username}": ${JSON.stringify(ofp.fetch)}`
    )
  }

  const { origin, destination, alternate, general, aircraft, weights, fuel, times, params, navlog } = ofp
  if (!origin || !destination || !general || !aircraft || !weights || !fuel || !times || !params) {
    throw new SimBriefError('SimBrief response is missing an expected top-level section')
  }

  const kgFactor = params.units === 'lbs' ? 1 / LB_PER_KG : 1
  const toKg = (value: unknown): number => num(value) * kgFactor

  const fixes = Array.isArray((navlog as Record<string, unknown> | undefined)?.fix)
    ? ((navlog as { fix: Record<string, unknown>[] }).fix as Record<string, unknown>[])
    : []

  return {
    ofpId: str(params.request_id),
    aircraftIcaoType: str(aircraft.icaocode),
    aircraftRegistration: str(aircraft.reg),
    flightNumber: `${str(general.icao_airline)}${str(general.flight_number)}`,
    depIcao: str(origin.icao_code),
    arrIcao: str(destination.icao_code),
    altnIcao: str(alternate?.icao_code),
    routeString: str(general.route),
    cruiseAltM: num(general.initial_altitude) * 0.3048,
    schedOutUtc: epochSecondsToIso(times.sched_out),
    schedInUtc: epochSecondsToIso(times.sched_in),
    fuelPlannedKg: toKg(fuel.plan_ramp),
    pax: Math.round(num(weights.pax_count)),
    cargoKg: toKg(weights.cargo),
    zfwKg: toKg(weights.est_zfw),
    towKg: toKg(weights.est_tow),
    ldwKg: toKg(weights.est_ldw),
    waypoints: fixes.map((fix) => ({
      ident: str(fix.ident),
      altitudeFt: num(fix.altitude_feet ?? 0),
      distanceNm: num(fix.distance ?? 0)
    })),
    stepClimbs: computeStepClimbs(
      fixes.map((fix) => ({
        ident: str(fix.ident),
        altitudeFt: num(fix.altitude_feet ?? 0),
        stage: str(fix.stage)
      }))
    ),
    rawJson: JSON.stringify(raw)
  }
}
