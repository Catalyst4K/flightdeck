import { describe, expect, it } from 'vitest'
import { loadRunwayEnds, resolveAirportPosition, resolveRunwayEnd, type RunwayEnd } from './runway-lookup'

const FIXTURE: RunwayEnd[] = [
  // KLAX has real parallel runways at (nearly) the same heading — a good stand-in for
  // the parallel-runway case without needing the full real dataset.
  { icao: 'KLAX', ident: '25L', lat: 33.9425, lon: -118.4081, headingTrueDeg: 250 },
  { icao: 'KLAX', ident: '25R', lat: 33.9364, lon: -118.4081, headingTrueDeg: 250 },
  { icao: 'KLAX', ident: '07L', lat: 33.9364, lon: -118.3809, headingTrueDeg: 70 },
  { icao: 'EGLL', ident: '27L', lat: 51.4775, lon: -0.4614, headingTrueDeg: 270 }
]

describe('resolveRunwayEnd', () => {
  it('picks the runway end whose heading matches the touchdown heading', () => {
    const result = resolveRunwayEnd(FIXTURE, 'EGLL', 270, 51.4775, -0.4614)
    expect(result?.ident).toBe('27L')
  })

  it('never matches a different airport', () => {
    const result = resolveRunwayEnd(FIXTURE, 'KJFK', 270, 51.4775, -0.4614)
    expect(result).toBeNull()
  })

  it('rejects a heading more than the plausible tolerance away from any candidate', () => {
    // EGLL only has 27L (270) in the fixture — a touchdown heading of 090 is off by 180.
    const result = resolveRunwayEnd(FIXTURE, 'EGLL', 90, 51.4775, -0.4614)
    expect(result).toBeNull()
  })

  it('picks the nearer of two parallel runways with the same heading, by touchdown position', () => {
    // Touchdown position much closer to 25R's threshold than 25L's.
    const nearR = resolveRunwayEnd(FIXTURE, 'KLAX', 250, 33.9364, -118.4081)
    expect(nearR?.ident).toBe('25R')

    const nearL = resolveRunwayEnd(FIXTURE, 'KLAX', 250, 33.9425, -118.4081)
    expect(nearL?.ident).toBe('25L')
  })

  it('prefers a closer heading match over a closer position on a different runway', () => {
    // Touchdown near 25L/25R's longitude but heading matches 07L (reciprocal-ish area) —
    // heading dominates the score, so it should not pick a parallel runway just because
    // it's geographically nearer.
    const result = resolveRunwayEnd(FIXTURE, 'KLAX', 70, 33.9364, -118.3809)
    expect(result?.ident).toBe('07L')
  })
})

describe('resolveAirportPosition', () => {
  it('averages every runway end for the airport, not just one', () => {
    // KLAX has three ends in the fixture, at three different lat/lons.
    const result = resolveAirportPosition(FIXTURE, 'KLAX')
    expect(result).toEqual({
      lat: (33.9425 + 33.9364 + 33.9364) / 3,
      lon: (-118.4081 + -118.4081 + -118.3809) / 3
    })
  })

  it('is case-insensitive on the ICAO', () => {
    expect(resolveAirportPosition(FIXTURE, 'egll')).toEqual({ lat: 51.4775, lon: -0.4614 })
  })

  it('returns null for an airport with no runway data at all', () => {
    expect(resolveAirportPosition(FIXTURE, 'ZZZZ')).toBeNull()
  })
})

describe('loadRunwayEnds', () => {
  it('parses a real-shaped CSV and skips rows with missing/non-numeric fields', () => {
    const csv = ['icao,ident,lat,lon,heading_true_deg', 'EGLL,27L,51.4775,-0.4614,270', 'EGLL,,,,', 'BAD,X,notanumber,0,0'].join(
      '\n'
    )
    const ends = loadRunwayEnds(csv)
    expect(ends).toEqual([{ icao: 'EGLL', ident: '27L', lat: 51.4775, lon: -0.4614, headingTrueDeg: 270 }])
  })
})
