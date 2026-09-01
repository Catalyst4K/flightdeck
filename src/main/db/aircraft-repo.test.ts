import { beforeEach, describe, expect, it } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, type FlightdeckDb } from './client'
import { createAircraft, listAircraft } from './aircraft-repo'

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

  it('writes a row and reads it back', () => {
    const created = createAircraft(db, { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' })

    expect(created.id).toBeTypeOf('number')
    expect(listAircraft(db)).toEqual([created])
  })
})
