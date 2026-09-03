import { desc, eq } from 'drizzle-orm'
import type { AircraftLanding, Landing } from '@shared/ipc'
import { flight, landing } from './schema'
import type { FlightdeckDb } from './client'

function toLanding(row: typeof landing.$inferSelect): Landing {
  return {
    id: row.id,
    flightId: row.flightId,
    touchdownTsUtc: row.touchdownTsUtc,
    verticalSpeedMs: row.verticalSpeedMs,
    gForce: row.gForce,
    pitchDeg: row.pitchDeg,
    bankDeg: row.bankDeg,
    headingTrueDeg: row.headingTrueDeg,
    indicatedAirspeedMs: row.indicatedAirspeedMs,
    groundSpeedMs: row.groundSpeedMs,
    windSpeedMs: row.windSpeedMs,
    windDirectionDeg: row.windDirectionDeg,
    headwindMs: row.headwindMs,
    crosswindMs: row.crosswindMs,
    runwayIdent: row.runwayIdent,
    distanceFromThresholdM: row.distanceFromThresholdM,
    centrelineOffsetM: row.centrelineOffsetM,
    flapSetting: row.flapSetting,
    touchdownSource: row.touchdownSource
  }
}

export type NewLanding = Omit<Landing, 'id'>

export function getLandingByFlight(db: FlightdeckDb, flightId: number): Landing | undefined {
  const row = db.select().from(landing).where(eq(landing.flightId, flightId)).get()
  return row ? toLanding(row) : undefined
}

/** flight.flight_id is unique — at most one landing per flight, so a re-capture (e.g. a
 *  rescan) replaces rather than duplicates. */
export function createLanding(db: FlightdeckDb, input: NewLanding): Landing {
  const [row] = db
    .insert(landing)
    .values(input)
    .onConflictDoUpdate({ target: landing.flightId, set: input })
    .returning()
    .all()
  return toLanding(row)
}

/** Fleet's per-aircraft landing history — one join, newest first. Aircraft with no
 *  landing records (the common case for a while) simply return an empty array. */
export function listLandingsByAircraft(db: FlightdeckDb, aircraftId: number): AircraftLanding[] {
  return db
    .select({
      landing: landing,
      flightNumber: flight.flightNumber,
      depIcao: flight.depIcao,
      arrIcao: flight.arrIcao
    })
    .from(landing)
    .innerJoin(flight, eq(landing.flightId, flight.id))
    .where(eq(flight.aircraftId, aircraftId))
    .orderBy(desc(landing.touchdownTsUtc))
    .all()
    .map((row) => ({ ...toLanding(row.landing), flightNumber: row.flightNumber, depIcao: row.depIcao, arrIcao: row.arrIcao }))
}
