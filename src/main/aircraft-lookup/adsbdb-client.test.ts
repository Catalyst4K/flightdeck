import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAircraftByRegistration } from './adsbdb-client'

// Real response shape captured live from https://api.adsbdb.com/v0/aircraft/G-XWBS
// (docs/decisions.md, 2026-09-01) — not synthesised.
const REAL_RESPONSE = {
  response: {
    aircraft: {
      type: 'A350-1041',
      icao_type: 'A35K',
      manufacturer: 'Airbus Sas',
      mode_s: '407FCD',
      registration: 'G-XWBS',
      registered_owner_country_iso_name: 'GB',
      registered_owner_country_name: 'United Kingdom',
      registered_owner_operator_flag_code: 'BAW',
      registered_owner: 'British Airways',
      url_photo: null,
      url_photo_thumbnail: null
    }
  }
}

describe('fetchAircraftByRegistration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps a found aircraft to icaoType/operator/name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => REAL_RESPONSE }))
    )

    const result = await fetchAircraftByRegistration('G-XWBS')

    expect(result).toEqual({ icaoType: 'A35K', operator: 'British Airways', name: 'A350-1041' })
  })

  it('returns null (not an error) for a 404 — a made-up or unrecognised registration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => undefined }))
    )

    const result = await fetchAircraftByRegistration('ZZ-FAKE1')

    expect(result).toBeNull()
  })

  it('throws for a non-404 failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => undefined }))
    )

    await expect(fetchAircraftByRegistration('G-XWBS')).rejects.toThrow(/HTTP 500/)
  })

  it('throws when the response is missing the expected aircraft data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ response: {} }) }))
    )

    await expect(fetchAircraftByRegistration('G-XWBS')).rejects.toThrow(/missing/)
  })
})
