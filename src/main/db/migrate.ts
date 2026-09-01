import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from './client'

export function migrateDb(dbPath: string): void {
  const { sqlite, db } = createDb(dbPath)
  migrate(db, { migrationsFolder: 'drizzle' })
  sqlite.close()
}
