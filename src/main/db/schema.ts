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

// Flight table per PLAN.md §5. `law_kg` in that sketch was landing weight — named
// `ldw_kg` here to match both SimBrief's own field name (`est_ldw`) and standard
// aviation terminology. Altitude and weights are SI per docs/decisions.md §5; times are
// ISO 8601 UTC strings (SimBrief reports unix epoch seconds — converted on fetch).
// actual_*/block/air/fuel_out/fuel_in/fuel_burn/sim_version stay null until M4 tracking
// fills them in; M3 only ever writes a 'planned' row from a fetched OFP.
export const flight = sqliteTable('flight', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  aircraftId: integer('aircraft_id')
    .notNull()
    .references(() => aircraft.id),
  status: text('status', { enum: ['planned', 'active', 'completed', 'abandoned'] })
    .notNull()
    .default('planned'),
  flightNumber: text('flight_number'),
  depIcao: text('dep_icao').notNull(),
  arrIcao: text('arr_icao').notNull(),
  altnIcao: text('altn_icao'),
  routeString: text('route_string'),
  cruiseAltM: real('cruise_alt_m'),
  schedOutUtc: text('sched_out_utc'),
  schedInUtc: text('sched_in_utc'),
  actualOutUtc: text('actual_out_utc'),
  actualOffUtc: text('actual_off_utc'),
  actualOnUtc: text('actual_on_utc'),
  actualInUtc: text('actual_in_utc'),
  blockMinutes: real('block_minutes'),
  airMinutes: real('air_minutes'),
  fuelPlannedKg: real('fuel_planned_kg'),
  fuelOutKg: real('fuel_out_kg'),
  fuelInKg: real('fuel_in_kg'),
  fuelBurnKg: real('fuel_burn_kg'),
  pax: integer('pax'),
  cargoKg: real('cargo_kg'),
  zfwKg: real('zfw_kg'),
  towKg: real('tow_kg'),
  ldwKg: real('ldw_kg'),
  ofpId: text('ofp_id'),
  ofpJson: text('ofp_json'),
  simVersion: text('sim_version'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`)
})

// Local app settings — key/value so future milestones (map tile source, etc.) don't need
// a new migration per setting. Not an "account": nothing here leaves the machine.
export const appSetting = sqliteTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
