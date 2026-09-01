import type { Aircraft, NewAircraft } from '@shared/ipc'
import { aircraft } from './schema'
import type { FlightdeckDb } from './client'

function toAircraft(row: typeof aircraft.$inferSelect): Aircraft {
  return {
    id: row.id,
    registration: row.registration,
    icaoType: row.icaoType,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt
  }
}

export function listAircraft(db: FlightdeckDb): Aircraft[] {
  return db.select().from(aircraft).all().map(toAircraft)
}

export function createAircraft(db: FlightdeckDb, input: NewAircraft): Aircraft {
  const [row] = db
    .insert(aircraft)
    .values({
      registration: input.registration,
      icaoType: input.icaoType,
      name: input.name
    })
    .returning()
    .all()
  return toAircraft(row)
}
