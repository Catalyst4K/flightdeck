import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from './client'

// migrationsFolder defaults to a cwd-relative path — correct for scripts/db-migrate.ts
// and tests, which always run from the project root. The real app can't rely on cwd (a
// packaged app's cwd depends on how it was launched, not on where its files live), so
// src/main/index.ts passes an absolute path derived from app.getAppPath() instead.
export function migrateDb(dbPath: string, migrationsFolder = 'drizzle'): void {
  const { sqlite, db } = createDb(dbPath)
  migrate(db, { migrationsFolder })
  sqlite.close()
}
