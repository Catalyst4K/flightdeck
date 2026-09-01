import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Full aircraft table per PLAN.md §5. Weight fields are SI (kg) per docs/decisions.md §5
// — convert to lb only at the UI layer, same rule as sim telemetry.
export const aircraft = sqliteTable('aircraft', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  registration: text('registration').notNull().unique(),
  icaoType: text('icao_type').notNull(),
  name: text('name').notNull(),
  operator: text('operator'),
  livery: text('livery'),
  simbriefAirframeId: text('simbrief_airframe_id'),
  oewKg: real('oew_kg'),
  mzfwKg: real('mzfw_kg'),
  mtowKg: real('mtow_kg'),
  mlwKg: real('mlw_kg'),
  maxFuelKg: real('max_fuel_kg'),
  maxPax: integer('max_pax'),
  equip: text('equip'),
  transponder: text('transponder'),
  pbn: text('pbn'),
  wakeCat: text('wake_cat'),
  currentIcao: text('current_icao'),
  totalHours: real('total_hours').notNull().default(0),
  totalCycles: integer('total_cycles').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`)
})
