import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchLatestOfp } from './simbrief-client'

// Minimal fixture using the real field names/shape verified against a live SimBrief OFP
// response (see docs note in simbrief-client.ts) — not real personal flight data.
function fixture(units: 'kgs' | 'lbs'): unknown {
  return {
    fetch: { status: 'Success' },
    params: { request_id: '12345', units },
    origin: { icao_code: 'EGLL' },
    destination: { icao_code: 'VHHH' },
    alternate: { icao_code: 'VMMC' },
    general: { icao_airline: 'BAW', flight_number: '31', route: 'BPK7F BPK DCT', initial_altitude: '33000' },
    aircraft: { icaocode: 'A35K', reg: 'G-XWBS' },
    weights: { pax_count: '328', cargo: '8200', est_zfw: '189112', est_tow: '273642', est_ldw: '198861' },
    fuel: { plan_ramp: '85029' },
    times: { sched_out: '1787860800', sched_in: '1787898900' },
    navlog: {
      fix: [
        { ident: 'BPK', altitude_feet: '4000', distance: '5' },
        { ident: 'VHHH', altitude_feet: '0', distance: '20' }
      ]
    }
  }
}

describe('fetchLatestOfp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses a kgs-profile OFP with no unit conversion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => fixture('kgs') }))
    )

    const ofp = await fetchLatestOfp('LandingHangar711')

    expect(ofp.ofpId).toBe('12345')
    expect(ofp.aircraftIcaoType).toBe('A35K')
    expect(ofp.aircraftRegistration).toBe('G-XWBS')
    expect(ofp.flightNumber).toBe('BAW31')
    expect(ofp.depIcao).toBe('EGLL')
    expect(ofp.arrIcao).toBe('VHHH')
    expect(ofp.altnIcao).toBe('VMMC')
    expect(ofp.cruiseAltM).toBeCloseTo(33000 * 0.3048, 3)
    expect(ofp.schedOutUtc).toBe(new Date(1787860800 * 1000).toISOString())
    expect(ofp.fuelPlannedKg).toBe(85029)
    expect(ofp.pax).toBe(328)
    expect(ofp.cargoKg).toBe(8200)
    expect(ofp.zfwKg).toBe(189112)
    expect(ofp.towKg).toBe(273642)
    expect(ofp.ldwKg).toBe(198861)
    expect(ofp.waypoints).toEqual([
      { ident: 'BPK', altitudeFt: 4000, distanceNm: 5 },
      { ident: 'VHHH', altitudeFt: 0, distanceNm: 20 }
    ])
  })

  it('converts weights when the SimBrief profile uses lbs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => fixture('lbs') }))
    )

    const ofp = await fetchLatestOfp('LandingHangar711')

    // 85029 lb -> kg
    expect(ofp.fuelPlannedKg).toBeCloseTo(85029 / 2.2046226218, 3)
    expect(ofp.zfwKg).toBeCloseTo(189112 / 2.2046226218, 3)
  })

  it('throws when SimBrief reports an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ fetch: { status: 'Error' } }) }))
    )
    await expect(fetchLatestOfp('nobody')).rejects.toThrow('nobody')
  })

  it('throws on a non-2xx HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }))
    )
    await expect(fetchLatestOfp('nobody')).rejects.toThrow('400')
  })
})
