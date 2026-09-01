import { desc, eq } from 'drizzle-orm'
import type { Flight, FleetStats, NewFlight } from '@shared/ipc'
import { aircraft, flight } from './schema'
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

function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000
}

export function listFlights(db: FlightdeckDb): Flight[] {
  // Order by id, not created_at: current_timestamp has 1-second resolution and two
  // flights created in the same second would otherwise tie with no defined order.
  return db.select().from(flight).orderBy(desc(flight.id)).all().map(toFlight)
}

export function getFlight(db: FlightdeckDb, id: number): Flight | undefined {
  const row = db.select().from(flight).where(eq(flight.id, id)).get()
  return row ? toFlight(row) : undefined
}

export function createFlight(db: FlightdeckDb, input: NewFlight): Flight {
  const [row] = db.insert(flight).values(input).returning().all()
  return toFlight(row)
}

/** Block-out: the flight goes 'active' and tracking begins. */
export function startFlight(
  db: FlightdeckDb,
  id: number,
  fuelOutKg: number,
  simVersion?: string
): Flight | undefined {
  const [row] = db
    .update(flight)
    .set({ status: 'active', actualOutUtc: new Date().toISOString(), fuelOutKg, simVersion })
    .where(eq(flight.id, id))
    .returning()
    .all()
  return row ? toFlight(row) : undefined
}

/** Liftoff — the takeoff → climb transition. */
export function recordOff(db: FlightdeckDb, id: number): Flight | undefined {
  const [row] = db
    .update(flight)
    .set({ actualOffUtc: new Date().toISOString() })
    .where(eq(flight.id, id))
    .returning()
    .all()
  return row ? toFlight(row) : undefined
}

/** Touchdown — the descent → landing transition. */
export function recordOn(db: FlightdeckDb, id: number): Flight | undefined {
  const [row] = db
    .update(flight)
    .set({ actualOnUtc: new Date().toISOString() })
    .where(eq(flight.id, id))
    .returning()
    .all()
  return row ? toFlight(row) : undefined
}

/** Block-in: shutdown reached. Derives block/air time and fuel burn from the timestamps already recorded. */
export function completeFlight(db: FlightdeckDb, id: number, fuelInKg: number): Flight | undefined {
  const existing = getFlight(db, id)
  if (!existing) return undefined

  const actualInUtc = new Date().toISOString()
  const [row] = db
    .update(flight)
    .set({
      status: 'completed',
      actualInUtc,
      fuelInKg,
      blockMinutes: minutesBetween(existing.actualOutUtc, actualInUtc),
      airMinutes: minutesBetween(existing.actualOffUtc, existing.actualOnUtc),
      fuelBurnKg: existing.fuelOutKg != null ? existing.fuelOutKg - fuelInKg : null
    })
    .where(eq(flight.id, id))
    .returning()
    .all()
  return row ? toFlight(row) : undefined
}

/** User cancelled tracking mid-flight — stop recording without pretending it completed normally. */
export function abandonFlight(db: FlightdeckDb, id: number): Flight | undefined {
  const [row] = db.update(flight).set({ status: 'abandoned' }).where(eq(flight.id, id)).returning().all()
  return row ? toFlight(row) : undefined
}

export function listCompletedFlights(db: FlightdeckDb): Flight[] {
  return db
    .select()
    .from(flight)
    .where(eq(flight.status, 'completed'))
    .orderBy(desc(flight.actualInUtc))
    .all()
    .map(toFlight)
}

/**
 * One row per aircraft with a completed flight, derived live from `flight` rather than
 * `Aircraft.totalHours`/`totalCycles` — nothing currently writes to those columns, so
 * they can't be trusted as a running total. Aircraft with no completed flights are
 * omitted rather than shown with zeroes.
 */
export function getFleetStats(db: FlightdeckDb): FleetStats[] {
  const completed = listCompletedFlights(db) // newest first
  const aircraftById = new Map(
    db
      .select()
      .from(aircraft)
      .all()
      .map((row) => [row.id, row.registration])
  )

  const byAircraft = new Map<number, FleetStats>()
  for (const f of completed) {
    const registration = aircraftById.get(f.aircraftId)
    if (!registration) continue // orphaned flight row, e.g. its aircraft was deleted

    const existing = byAircraft.get(f.aircraftId)
    if (existing) {
      existing.totalHours += (f.blockMinutes ?? 0) / 60
      existing.totalCycles += 1
    } else {
      byAircraft.set(f.aircraftId, {
        aircraftId: f.aircraftId,
        registration,
        totalHours: (f.blockMinutes ?? 0) / 60,
        totalCycles: 1,
        lastArrIcao: f.arrIcao,
        lastFlightInUtc: f.actualInUtc
      })
    }
  }
  return [...byAircraft.values()].sort((a, b) => a.registration.localeCompare(b.registration))
}
