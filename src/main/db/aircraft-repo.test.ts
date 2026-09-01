import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, type FlightdeckDb } from './client'
import {
  createAircraft,
  deleteAircraft,
  getAircraftByRegistration,
  listAircraft,
  updateAircraft
} from './aircraft-repo'

describe('aircraft repo', () => {
  let db: FlightdeckDb

  beforeEach(() => {
    const created = createDb(':memory:')
    migrate(created.db, { migrationsFolder: 'drizzle' })
    db = created.db
  })

  it('starts empty', () => {
    expect(listAircraft(db)).toEqual([])
  })

  it('writes a row and reads it back, with defaults applied', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' })

    expect(created.id).toBeTypeOf('number')
    expect(created.isActive).toBe(true)
    expect(created.totalHours).toBe(0)
    expect(created.totalCycles).toBe(0)
    expect(created.operator).toBeNull()
    expect(listAircraft(db)).toEqual([created])
  })

  it('stores the full field set', () => {
    const created = createAircraft(db, {
      registration: 'G-ABCD',
      icaoType: 'A320',
      name: 'Test',
      operator: 'Test Air',
      oewKg: 42600,
      mtowKg: 78000,
      maxPax: 180,
      wakeCat: 'M',
      totalHours: 1234.5,
      totalCycles: 987
    })

    expect(created.operator).toBe('Test Air')
    expect(created.oewKg).toBe(42600)
    expect(created.mtowKg).toBe(78000)
    expect(created.maxPax).toBe(180)
    expect(created.wakeCat).toBe('M')
    expect(created.totalHours).toBe(1234.5)
    expect(created.totalCycles).toBe(987)
  })

  it('rejects a duplicate registration', () => {
    createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' })
    expect(() => createAircraft(db, { registration: 'G-ABCD', icaoType: 'B738', name: 'Other' })).toThrow()
  })

  it('finds an aircraft by registration', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' })
    expect(getAircraftByRegistration(db, 'G-ABCD')).toEqual(created)
    expect(getAircraftByRegistration(db, 'G-NOPE')).toBeUndefined()
  })

  it('updates an aircraft', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' })
    const updated = updateAircraft(db, {
      id: created.id,
      registration: 'G-ABCD',
      icaoType: 'A320',
      name: 'Renamed'
    })
    expect(updated?.name).toBe('Renamed')
    expect(listAircraft(db)).toEqual([updated])
  })

  it('deletes an aircraft', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' })
    deleteAircraft(db, created.id)
    expect(listAircraft(db)).toEqual([])
  })
})
