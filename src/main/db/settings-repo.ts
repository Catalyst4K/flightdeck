import { eq } from 'drizzle-orm'
import type { WeightUnit } from '@shared/ipc'
import { appSetting } from './schema'
import type { FlightdeckDb } from './client'

const SIMBRIEF_USERNAME_KEY = 'simbriefUsername'
const WEIGHT_UNIT_KEY = 'weightUnit'

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

export function getWeightUnit(db: FlightdeckDb): WeightUnit {
  return getSetting(db, WEIGHT_UNIT_KEY) === 'kg' ? 'kg' : 'lb'
}

export function setWeightUnit(db: FlightdeckDb, unit: WeightUnit): void {
  setSetting(db, WEIGHT_UNIT_KEY, unit)
}
