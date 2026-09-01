import { desc } from 'drizzle-orm'
import type { Flight, NewFlight } from '@shared/ipc'
import { flight } from './schema'
import type { FlightdeckDb } from './client'

function toFlight(row: typeof flight.$inferSelect): Flight {
  return {
    id: row.id,
    aircraftId: row.aircraftId,
    status: row.status,
    flightNumber: row.flightNumber,
    depIcao: row.depIcao,
    arrIcao: row.arrIcao,
    altnIcao: row.altnIcao,
    routeString: row.routeString,
    cruiseAltM: row.cruiseAltM,
    schedOutUtc: row.schedOutUtc,
    schedInUtc: row.schedInUtc,
    actualOutUtc: row.actualOutUtc,
    actualOffUtc: row.actualOffUtc,
    actualOnUtc: row.actualOnUtc,
    actualInUtc: row.actualInUtc,
    blockMinutes: row.blockMinutes,
    airMinutes: row.airMinutes,
    fuelPlannedKg: row.fuelPlannedKg,
    fuelOutKg: row.fuelOutKg,
    fuelInKg: row.fuelInKg,
    fuelBurnKg: row.fuelBurnKg,
    pax: row.pax,
    cargoKg: row.cargoKg,
    zfwKg: row.zfwKg,
    towKg: row.towKg,
    ldwKg: row.ldwKg,
    ofpId: row.ofpId,
    ofpJson: row.ofpJson,
    simVersion: row.simVersion,
    createdAt: row.createdAt
  }
}

export function listFlights(db: FlightdeckDb): Flight[] {
  // Order by id, not created_at: current_timestamp has 1-second resolution and two
  // flights created in the same second would otherwise tie with no defined order.
  return db.select().from(flight).orderBy(desc(flight.id)).all().map(toFlight)
}

export function createFlight(db: FlightdeckDb, input: NewFlight): Flight {
  const [row] = db.insert(flight).values(input).returning().all()
  return toFlight(row)
}
