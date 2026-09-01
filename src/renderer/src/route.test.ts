import { describe, expect, it } from 'vitest'
import { parseAirportsFromOfpJson, parseRouteFromOfpJson, parseWaypointsFromOfpJson } from './route'

describe('parseRouteFromOfpJson', () => {
  it('extracts [lon, lat] pairs from navlog fixes', () => {
    const ofp = JSON.stringify({
      navlog: {
        fix: [
          { ident: 'BPK', pos_lat: '51.485872', pos_long: '-0.573167' },
          { ident: 'VHHH', pos_lat: '22.308889', pos_long: '113.914722' }
        ]
      }
    })
    expect(parseRouteFromOfpJson(ofp)).toEqual([
      [-0.573167, 51.485872],
      [113.914722, 22.308889]
    ])
  })

  it('returns an empty route for null input', () => {
    expect(parseRouteFromOfpJson(null)).toEqual([])
  })

  it('returns an empty route for invalid JSON', () => {
    expect(parseRouteFromOfpJson('not json')).toEqual([])
  })

  it('returns an empty route when navlog/fix is missing', () => {
    expect(parseRouteFromOfpJson(JSON.stringify({}))).toEqual([])
    expect(parseRouteFromOfpJson(JSON.stringify({ navlog: {} }))).toEqual([])
  })

  it('skips fixes with non-numeric coordinates', () => {
    const ofp = JSON.stringify({ navlog: { fix: [{ pos_lat: 'n/a', pos_long: '-0.5' }] } })
    expect(parseRouteFromOfpJson(ofp)).toEqual([])
  })
})

describe('parseWaypointsFromOfpJson', () => {
  it('extracts ident/lon/lat/altitude from navlog fixes', () => {
    const ofp = JSON.stringify({
      navlog: {
        fix: [
          { ident: 'BPK', pos_lat: '51.485872', pos_long: '-0.573167', altitude_feet: '5000' },
          { ident: 'VHHH', pos_lat: '22.308889', pos_long: '113.914722', altitude_feet: '0' }
        ]
      }
    })
    expect(parseWaypointsFromOfpJson(ofp)).toEqual([
      { ident: 'BPK', lon: -0.573167, lat: 51.485872, altitudeFt: 5000 },
      { ident: 'VHHH', lon: 113.914722, lat: 22.308889, altitudeFt: 0 }
    ])
  })

  it('returns an empty list for null input', () => {
    expect(parseWaypointsFromOfpJson(null)).toEqual([])
  })

  it('skips fixes with no ident or non-numeric coordinates', () => {
    const ofp = JSON.stringify({
      navlog: { fix: [{ pos_lat: '51.5', pos_long: '-0.5' }, { ident: 'X', pos_lat: 'n/a', pos_long: '-0.5' }] }
    })
    expect(parseWaypointsFromOfpJson(ofp)).toEqual([])
  })
})

describe('parseAirportsFromOfpJson', () => {
  it('extracts dep/arr/altn ICAO codes', () => {
    const ofp = JSON.stringify({
      origin: { icao_code: 'EGLL' },
      destination: { icao_code: 'VHHH' },
      alternate: { icao_code: 'VMMC' }
    })
    expect(parseAirportsFromOfpJson(ofp)).toEqual({ depIcao: 'EGLL', arrIcao: 'VHHH', altnIcao: 'VMMC' })
  })

  it('handles a missing alternate — genuinely optional in a real OFP', () => {
    const ofp = JSON.stringify({ origin: { icao_code: 'EGLL' }, destination: { icao_code: 'VHHH' } })
    expect(parseAirportsFromOfpJson(ofp)).toEqual({ depIcao: 'EGLL', arrIcao: 'VHHH', altnIcao: null })
  })

  it('returns all null for null input', () => {
    expect(parseAirportsFromOfpJson(null)).toEqual({ depIcao: null, arrIcao: null, altnIcao: null })
  })

  it('returns all null for invalid JSON', () => {
    expect(parseAirportsFromOfpJson('not json')).toEqual({ depIcao: null, arrIcao: null, altnIcao: null })
  })
})
