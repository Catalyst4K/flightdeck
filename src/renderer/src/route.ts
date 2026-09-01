/**
 * Extracts the planned route as [lon, lat] pairs (GeoJSON order) from a flight's raw
 * SimBrief OFP JSON — specifically `navlog.fix[].pos_lat`/`pos_long`, sim-confirmed real
 * field names/shapes during M3 (docs/decisions.md, 2026-09-01 dispatch entry). Returns an
 * empty route rather than throwing on anything unexpected — a missing planned route just
 * means the map has no line to draw, not a reason to break the page.
 */
export function parseRouteFromOfpJson(ofpJson: string | null): [number, number][] {
  if (!ofpJson) return []
  try {
    const parsed: unknown = JSON.parse(ofpJson)
    const fixes = (parsed as { navlog?: { fix?: unknown } })?.navlog?.fix
    if (!Array.isArray(fixes)) return []

    const points: [number, number][] = []
    for (const fix of fixes as Record<string, unknown>[]) {
      const lon = Number(fix.pos_long)
      const lat = Number(fix.pos_lat)
      if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat])
    }
    return points
  } catch {
    return []
  }
}
