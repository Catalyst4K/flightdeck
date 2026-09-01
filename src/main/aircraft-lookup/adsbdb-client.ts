/**
 * Aircraft registration lookup via adsbdb.com (docs/decisions.md, 2026-09-01) — free,
 * keyless, no documented rate limit. Verified against a real live response, not just its
 * docs:
 *
 *   GET https://api.adsbdb.com/v0/aircraft/G-XWBS
 *   { "response": { "aircraft": { "type": "A350-1041", "icao_type": "A35K",
 *       "manufacturer": "Airbus Sas", "registered_owner": "British Airways", ... } } }
 *
 * A registration with no match returns a plain HTTP 404 with no body (verified against a
 * made-up registration) — treated here as a normal "not found" outcome (`null`), not an
 * error, since the Fleet UI falls back to manual type search rather than showing a
 * failure. Attribution ("PlaneBase") is required by adsbdb's terms — shown in the Fleet
 * UI next to the lookup button, not just buried in this comment.
 */
import type { AircraftLookupResult } from '@shared/ipc'

class AdsbdbError extends Error {}

interface AdsbdbAircraft {
  type?: unknown
  icao_type?: unknown
  registered_owner?: unknown
}

export async function fetchAircraftByRegistration(
  registration: string
): Promise<AircraftLookupResult | null> {
  const url = `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(registration)}`
  const response = await fetch(url)
  if (response.status === 404) return null

  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok || typeof raw !== 'object' || raw === null) {
    throw new AdsbdbError(`adsbdb lookup failed (HTTP ${response.status}) for registration "${registration}"`)
  }

  const aircraft = (raw as { response?: { aircraft?: AdsbdbAircraft } }).response?.aircraft
  if (!aircraft || typeof aircraft.icao_type !== 'string' || !aircraft.icao_type) {
    throw new AdsbdbError(`adsbdb response for "${registration}" is missing the expected aircraft data`)
  }

  return {
    icaoType: aircraft.icao_type,
    operator: typeof aircraft.registered_owner === 'string' ? aircraft.registered_owner : null,
    name: typeof aircraft.type === 'string' && aircraft.type ? aircraft.type : aircraft.icao_type
  }
}
