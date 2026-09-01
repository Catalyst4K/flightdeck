import { eq } from 'drizzle-orm'
import { appSetting } from './schema'
import type { FlightdeckDb } from './client'

const SIMBRIEF_USERNAME_KEY = 'simbriefUsername'

export function getSetting(db: FlightdeckDb, key: string): string | undefined {
  return db.select().from(appSetting).where(eq(appSetting.key, key)).get()?.value
}

export function setSetting(db: FlightdeckDb, key: string, value: string): void {
  db.insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } })
    .run()
}

export function getSimbriefUsername(db: FlightdeckDb): string | undefined {
  return getSetting(db, SIMBRIEF_USERNAME_KEY)
}

export function setSimbriefUsername(db: FlightdeckDb, username: string): void {
  setSetting(db, SIMBRIEF_USERNAME_KEY, username)
}
