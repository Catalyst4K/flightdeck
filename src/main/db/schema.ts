import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// M0 slice of the aircraft table sketched in PLAN.md §5. Airframe performance
// figures, fleet metrics and SimBrief linkage arrive with M2 as their own migration.
export const aircraft = sqliteTable('aircraft', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  registration: text('registration').notNull().unique(),
  icaoType: text('icao_type').notNull(),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`)
})
