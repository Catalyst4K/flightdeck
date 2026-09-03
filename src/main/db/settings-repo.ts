import { eq } from 'drizzle-orm'
import type { AltitudeUnit, GsxSettings, WeightUnit } from '@shared/ipc'
import { appSetting } from './schema'
import type { FlightdeckDb } from './client'

const SIMBRIEF_USERNAME_KEY = 'simbriefUsername'
const WEIGHT_UNIT_KEY = 'weightUnit'
const ALTITUDE_UNIT_KEY = 'altitudeUnit'
const GSX_ENABLED_KEY = 'gsxEnabled'
const GSX_FOLDER_PATH_KEY = 'gsxFolderPath'

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

export function getAltitudeUnit(db: FlightdeckDb): AltitudeUnit {
  const value = getSetting(db, ALTITUDE_UNIT_KEY)
  return value === 'm' || value === 'hybrid' ? value : 'ft'
}

export function setAltitudeUnit(db: FlightdeckDb, unit: AltitudeUnit): void {
  setSetting(db, ALTITUDE_UNIT_KEY, unit)
}

/** Default off, empty path (docs/decisions.md, gsx-invoices entry) — someone without GSX
 *  should never see anything from this feature, so it stays opt-in rather than trying to
 *  auto-detect-and-enable. */
export function getGsxSettings(db: FlightdeckDb): GsxSettings {
  return { enabled: getSetting(db, GSX_ENABLED_KEY) === '1', folderPath: getSetting(db, GSX_FOLDER_PATH_KEY) || null }
}

export function setGsxSettings(db: FlightdeckDb, settings: GsxSettings): void {
  setSetting(db, GSX_ENABLED_KEY, settings.enabled ? '1' : '0')
  setSetting(db, GSX_FOLDER_PATH_KEY, settings.folderPath ?? '')
}
