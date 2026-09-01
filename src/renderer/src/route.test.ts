import { describe, expect, it } from 'vitest'
import { parseRouteFromOfpJson } from './route'

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
