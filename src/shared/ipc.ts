/**
 * Typed IPC contract between main and renderer. The renderer only ever calls
 * these — no direct filesystem, network, or SimConnect access (see CLAUDE.md).
 */

export interface Aircraft {
  id: number
  registration: string
  icaoType: string
  name: string
  operator: string | null
  livery: string | null
  simbriefAirframeId: string | null
  /** All weights in kg — SI internally, converted to lb only at the UI layer (§5). */
  oewKg: number | null
  mzfwKg: number | null
  mtowKg: number | null
  mlwKg: number | null
  maxFuelKg: number | null
  maxPax: number | null
  equip: string | null
  transponder: string | null
  pbn: string | null
  wakeCat: string | null
  currentIcao: string | null
  totalHours: number
  totalCycles: number
  isActive: boolean
  notes: string | null
  createdAt: string
}

export interface NewAircraft {
  registration: string
  icaoType: string
  name: string
  operator?: string | null
  livery?: string | null
  simbriefAirframeId?: string | null
  oewKg?: number | null
  mzfwKg?: number | null
  mtowKg?: number | null
  mlwKg?: number | null
  maxFuelKg?: number | null
  maxPax?: number | null
  equip?: string | null
  transponder?: string | null
  pbn?: string | null
  wakeCat?: string | null
  currentIcao?: string | null
  totalHours?: number
  totalCycles?: number
  isActive?: boolean
  notes?: string | null
}

export interface AircraftUpdate extends NewAircraft {
  id: number
}

export interface AircraftImportSkip {
  registration: string
  reason: string
}

export interface AircraftImportSummary {
  imported: number
  skipped: AircraftImportSkip[]
}

export const IpcChannels = {
  aircraftList: 'aircraft:list',
  aircraftCreate: 'aircraft:create',
  aircraftUpdate: 'aircraft:update',
  aircraftDelete: 'aircraft:delete',
  aircraftImport: 'aircraft:import',
  aircraftExport: 'aircraft:export'
} as const

export interface FlightdeckApi {
  aircraftList: () => Promise<Aircraft[]>
  aircraftCreate: (aircraft: NewAircraft) => Promise<Aircraft>
  aircraftUpdate: (aircraft: AircraftUpdate) => Promise<Aircraft>
  aircraftDelete: (id: number) => Promise<void>
  /** Opens a native file-open dialog in the main process; null if the user cancels. */
  aircraftImport: () => Promise<AircraftImportSummary | null>
  /** Opens a native file-save dialog in the main process; false if the user cancels. */
  aircraftExport: () => Promise<boolean>
}
