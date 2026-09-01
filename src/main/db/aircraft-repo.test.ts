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
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320' })

    expect(created.id).toBeTypeOf('number')
    expect(created.operator).toBeNull()
    expect(created.simbriefAirframeId).toBeNull()
    expect(created.currentIcao).toBeNull()
    expect(listAircraft(db)).toEqual([created])
  })

  it('stores the full field set', () => {
    const created = createAircraft(db, {
      registration: 'G-ABCD',
      icaoType: 'A320',
      operator: 'Test Air',
      simbriefAirframeId: '123456_1582090020',
      currentIcao: 'EGLL'
    })

    expect(created.operator).toBe('Test Air')
    expect(created.simbriefAirframeId).toBe('123456_1582090020')
    expect(created.currentIcao).toBe('EGLL')
  })

  it('rejects a duplicate registration', () => {
    createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320' })
    expect(() => createAircraft(db, { registration: 'G-ABCD', icaoType: 'B738' })).toThrow()
  })

  it('finds an aircraft by registration', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320' })
    expect(getAircraftByRegistration(db, 'G-ABCD')).toEqual(created)
    expect(getAircraftByRegistration(db, 'G-NOPE')).toBeUndefined()
  })

  it('updates an aircraft', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320' })
    const updated = updateAircraft(db, {
      id: created.id,
      registration: 'G-ABCD',
      icaoType: 'A320',
      operator: 'Renamed Air'
    })
    expect(updated?.operator).toBe('Renamed Air')
    expect(listAircraft(db)).toEqual([updated])
  })

  it('deletes an aircraft', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320' })
    deleteAircraft(db, created.id)
    expect(listAircraft(db)).toEqual([])
  })
})
