import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, type FlightdeckDb } from './client'
import { createAircraft } from './aircraft-repo'
import { createFlight, listFlights } from './flight-repo'

describe('flight repo', () => {
  let db: FlightdeckDb
  let aircraftId: number

  beforeEach(() => {
    const created = createDb(':memory:')
    migrate(created.db, { migrationsFolder: 'drizzle' })
    db = created.db
    aircraftId = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' }).id
  })

  it('starts empty', () => {
    expect(listFlights(db)).toEqual([])
  })

  it('creates a planned flight with defaults applied', () => {
    const created = createFlight(db, { aircraftId, depIcao: 'EGLL', arrIcao: 'VHHH' })

    expect(created.id).toBeTypeOf('number')
    expect(created.status).toBe('planned')
    expect(created.aircraftId).toBe(aircraftId)
    expect(created.depIcao).toBe('EGLL')
    expect(created.arrIcao).toBe('VHHH')
    expect(created.altnIcao).toBeNull()
    expect(listFlights(db)).toEqual([created])
  })

  it('stores OFP-derived fields', () => {
    const created = createFlight(db, {
      aircraftId,
      depIcao: 'EGLL',
      arrIcao: 'VHHH',
      altnIcao: 'VMMC',
      flightNumber: 'BAW31',
      cruiseAltM: 10058.4,
      fuelPlannedKg: 85029,
      pax: 328,
      ofpId: '184216371',
      ofpJson: '{"raw":true}'
    })

    expect(created.flightNumber).toBe('BAW31')
    expect(created.cruiseAltM).toBe(10058.4)
    expect(created.fuelPlannedKg).toBe(85029)
    expect(created.pax).toBe(328)
    expect(created.ofpId).toBe('184216371')
    expect(created.ofpJson).toBe('{"raw":true}')
  })

  it('rejects a flight for a nonexistent aircraft', () => {
    expect(() => createFlight(db, { aircraftId: 99999, depIcao: 'EGLL', arrIcao: 'VHHH' })).toThrow()
  })

  it('lists newest first', () => {
    const first = createFlight(db, { aircraftId, depIcao: 'EGLL', arrIcao: 'VHHH' })
    const second = createFlight(db, { aircraftId, depIcao: 'VHHH', arrIcao: 'EGLL' })
    expect(listFlights(db).map((f) => f.id)).toEqual([second.id, first.id])
  })
})
