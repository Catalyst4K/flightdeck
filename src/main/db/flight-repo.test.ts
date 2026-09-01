import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, type FlightdeckDb } from './client'
import { createAircraft } from './aircraft-repo'
import {
  abandonFlight,
  completeFlight,
  createFlight,
  getFlight,
  listFlights,
  recordOff,
  recordOn,
  startFlight
} from './flight-repo'

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

  it('gets a single flight by id', () => {
    const created = createFlight(db, { aircraftId, depIcao: 'EGLL', arrIcao: 'VHHH' })
    expect(getFlight(db, created.id)).toEqual(created)
    expect(getFlight(db, 99999)).toBeUndefined()
  })

  describe('tracking lifecycle', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('walks a flight from planned through completed with correct block/air time and fuel burn', () => {
      const created = createFlight(db, { aircraftId, depIcao: 'EGLL', arrIcao: 'VHHH' })

      const started = startFlight(db, created.id, 10000)
      expect(started?.status).toBe('active')
      expect(started?.actualOutUtc).toBe('2026-09-01T12:00:00.000Z')
      expect(started?.fuelOutKg).toBe(10000)

      vi.setSystemTime(new Date('2026-09-01T12:10:00Z'))
      recordOff(db, created.id)

      vi.setSystemTime(new Date('2026-09-01T13:40:00Z'))
      recordOn(db, created.id)

      vi.setSystemTime(new Date('2026-09-01T13:50:00Z'))
      const completed = completeFlight(db, created.id, 4000)

      expect(completed?.status).toBe('completed')
      expect(completed?.actualOffUtc).toBe('2026-09-01T12:10:00.000Z')
      expect(completed?.actualOnUtc).toBe('2026-09-01T13:40:00.000Z')
      expect(completed?.actualInUtc).toBe('2026-09-01T13:50:00.000Z')
      expect(completed?.blockMinutes).toBe(110) // 12:00 -> 13:50
      expect(completed?.airMinutes).toBe(90) // 12:10 -> 13:40
      expect(completed?.fuelBurnKg).toBe(6000) // 10000 - 4000
    })

    it('marks a cancelled flight abandoned rather than completed', () => {
      const created = createFlight(db, { aircraftId, depIcao: 'EGLL', arrIcao: 'VHHH' })
      startFlight(db, created.id, 10000)
      const abandoned = abandonFlight(db, created.id)
      expect(abandoned?.status).toBe('abandoned')
    })
  })
})
