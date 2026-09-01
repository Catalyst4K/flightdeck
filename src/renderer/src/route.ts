function navlogFixes(ofpJson: string | null): Record<string, unknown>[] {
  if (!ofpJson) return []
  try {
    const parsed: unknown = JSON.parse(ofpJson)
    const fixes = (parsed as { navlog?: { fix?: unknown } })?.navlog?.fix
    return Array.isArray(fixes) ? (fixes as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

/**
 * Extracts the planned route as [lon, lat] pairs (GeoJSON order) from a flight's raw
 * SimBrief OFP JSON — specifically `navlog.fix[].pos_lat`/`pos_long`, sim-confirmed real
 * field names/shapes during M3 (docs/decisions.md, 2026-09-01 dispatch entry). Returns an
 * empty route rather than throwing on anything unexpected — a missing planned route just
 * means the map has no line to draw, not a reason to break the page.
 */
export function parseRouteFromOfpJson(ofpJson: string | null): [number, number][] {
  const points: [number, number][] = []
  for (const fix of navlogFixes(ofpJson)) {
    const lon = Number(fix.pos_long)
    const lat = Number(fix.pos_lat)
    if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat])
  }
  return points
}

export interface OfpAirports {
  depIcao: string | null
  arrIcao: string | null
  altnIcao: string | null
}

/**
 * Extracts the planned departure/destination/alternate ICAO codes from a flight's raw
 * SimBrief OFP JSON — `origin.icao_code`/`destination.icao_code`/`alternate.icao_code`,
 * the same fields simbrief-client.ts's own mapping already relies on (alternate is
 * genuinely optional in a real OFP, the other two aren't). Same "empty rather than
 * throw" behavior as parseRouteFromOfpJson — used for Track's METAR panel when
 * previewing a fetched-but-not-yet-saved OFP, which has no Flight row to read these
 * from directly.
 */
export function parseAirportsFromOfpJson(ofpJson: string | null): OfpAirports {
  if (!ofpJson) return { depIcao: null, arrIcao: null, altnIcao: null }
  try {
    const parsed = JSON.parse(ofpJson) as {
      origin?: { icao_code?: unknown }
      destination?: { icao_code?: unknown }
      alternate?: { icao_code?: unknown }
    }
    const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
    return {
      depIcao: str(parsed.origin?.icao_code),
      arrIcao: str(parsed.destination?.icao_code),
      altnIcao: str(parsed.alternate?.icao_code)
    }
  } catch {
    return { depIcao: null, arrIcao: null, altnIcao: null }
  }
}

export interface Waypoint {
  ident: string
  lon: number
  lat: number
  altitudeFt: number
}

/**
 * Extracts per-fix waypoint markers (ident + altitude, alongside the same pos_lat/
 * pos_long used above) — `fix.ident`/`fix.altitude_feet` are the same verified fields
 * `simbrief-client.ts`'s own `waypoints` mapping already relies on. Same "empty rather
 * than throw" behavior as parseRouteFromOfpJson.
 */
export function parseWaypointsFromOfpJson(ofpJson: string | null): Waypoint[] {
  const waypoints: Waypoint[] = []
  for (const fix of navlogFixes(ofpJson)) {
    const lon = Number(fix.pos_long)
    const lat = Number(fix.pos_lat)
    const ident = typeof fix.ident === 'string' ? fix.ident : ''
    if (Number.isFinite(lon) && Number.isFinite(lat) && ident) {
      waypoints.push({ ident, lon, lat, altitudeFt: Number(fix.altitude_feet ?? 0) })
    }
  }
  return waypoints
}
