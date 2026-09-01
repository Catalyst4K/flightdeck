import { eq } from 'drizzle-orm'
import type { Aircraft, AircraftUpdate, NewAircraft } from '@shared/ipc'
import { aircraft } from './schema'
import type { FlightdeckDb } from './client'

function toAircraft(row: typeof aircraft.$inferSelect): Aircraft {
  return {
    id: row.id,
    registration: row.registration,
    icaoType: row.icaoType,
    name: row.name,
    operator: row.operator,
    livery: row.livery,
    simbriefAirframeId: row.simbriefAirframeId,
    oewKg: row.oewKg,
    mzfwKg: row.mzfwKg,
    mtowKg: row.mtowKg,
    mlwKg: row.mlwKg,
    maxFuelKg: row.maxFuelKg,
    maxPax: row.maxPax,
    equip: row.equip,
    transponder: row.transponder,
    pbn: row.pbn,
    wakeCat: row.wakeCat,
    currentIcao: row.currentIcao,
    totalHours: row.totalHours,
    totalCycles: row.totalCycles,
    isActive: row.isActive,
    notes: row.notes,
    createdAt: row.createdAt
  }
}

export function listAircraft(db: FlightdeckDb): Aircraft[] {
  return db.select().from(aircraft).all().map(toAircraft)
}

export function getAircraftByRegistration(db: FlightdeckDb, registration: string): Aircraft | undefined {
  const row = db.select().from(aircraft).where(eq(aircraft.registration, registration)).get()
  return row ? toAircraft(row) : undefined
}

export function createAircraft(db: FlightdeckDb, input: NewAircraft): Aircraft {
  const [row] = db.insert(aircraft).values(input).returning().all()
  return toAircraft(row)
}

export function updateAircraft(db: FlightdeckDb, input: AircraftUpdate): Aircraft | undefined {
  const { id, ...values } = input
  const [row] = db.update(aircraft).set(values).where(eq(aircraft.id, id)).returning().all()
  return row ? toAircraft(row) : undefined
}

export function deleteAircraft(db: FlightdeckDb, id: number): void {
  db.delete(aircraft).where(eq(aircraft.id, id)).run()
}
