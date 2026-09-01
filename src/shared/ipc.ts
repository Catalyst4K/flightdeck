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

export type FlightStatus = 'planned' | 'active' | 'completed' | 'abandoned'

export interface Flight {
  id: number
  aircraftId: number
  status: FlightStatus
  flightNumber: string | null
  depIcao: string
  arrIcao: string
  altnIcao: string | null
  routeString: string | null
  /** Meters — SI internally, converted to feet only at the UI layer (§5). */
  cruiseAltM: number | null
  schedOutUtc: string | null
  schedInUtc: string | null
  actualOutUtc: string | null
  actualOffUtc: string | null
  actualOnUtc: string | null
  actualInUtc: string | null
  blockMinutes: number | null
  airMinutes: number | null
  /** All weights in kg — SI internally, converted to lb only at the UI layer (§5). */
  fuelPlannedKg: number | null
  fuelOutKg: number | null
  fuelInKg: number | null
  fuelBurnKg: number | null
  pax: number | null
  cargoKg: number | null
  zfwKg: number | null
  towKg: number | null
  ldwKg: number | null
  ofpId: string | null
  ofpJson: string | null
  simVersion: string | null
  createdAt: string
}

export interface NewFlight {
  aircraftId: number
  status?: FlightStatus
  flightNumber?: string | null
  depIcao: string
  arrIcao: string
  altnIcao?: string | null
  routeString?: string | null
  cruiseAltM?: number | null
  schedOutUtc?: string | null
  schedInUtc?: string | null
  fuelPlannedKg?: number | null
  pax?: number | null
  cargoKg?: number | null
  zfwKg?: number | null
  towKg?: number | null
  ldwKg?: number | null
  ofpId?: string | null
  ofpJson?: string | null
}

export interface DispatchWaypoint {
  ident: string
  altitudeFt: number
  distanceNm: number
}

/** A freshly-fetched OFP, not yet saved as a Flight — the renderer confirms/picks the aircraft first. */
export interface DispatchOfp {
  ofpId: string
  aircraftIcaoType: string
  aircraftRegistration: string
  flightNumber: string
  depIcao: string
  arrIcao: string
  altnIcao: string
  routeString: string
  cruiseAltM: number
  schedOutUtc: string
  schedInUtc: string
  fuelPlannedKg: number
  pax: number
  cargoKg: number
  zfwKg: number
  towKg: number
  ldwKg: number
  waypoints: DispatchWaypoint[]
  ofpJson: string
  /** Fleet aircraft whose registration matches `aircraftRegistration`, if any. */
  matchedAircraftId: number | null
}

/**
 * Display unit for weights app-wide (Fleet and Dispatch both). Storage stays SI (kg)
 * regardless — see §5 — this only controls what the UI shows/accepts. Defaults to 'lb'
 * if never set.
 */
export type WeightUnit = 'kg' | 'lb'

export const IpcChannels = {
  aircraftList: 'aircraft:list',
  aircraftCreate: 'aircraft:create',
  aircraftUpdate: 'aircraft:update',
  aircraftDelete: 'aircraft:delete',
  aircraftImport: 'aircraft:import',
  aircraftExport: 'aircraft:export',
  flightList: 'flight:list',
  flightCreate: 'flight:create',
  dispatchFetchOfp: 'dispatch:fetch-ofp',
  dispatchOpenSimBrief: 'dispatch:open-simbrief',
  settingsGetSimbriefUsername: 'settings:get-simbrief-username',
  settingsSetSimbriefUsername: 'settings:set-simbrief-username',
  settingsGetWeightUnit: 'settings:get-weight-unit',
  settingsSetWeightUnit: 'settings:set-weight-unit'
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
  flightList: () => Promise<Flight[]>
  flightCreate: (flight: NewFlight) => Promise<Flight>
  /** Fetches the SimBrief user's latest OFP. Throws if no username is set or the fetch fails. */
  dispatchFetchOfp: () => Promise<DispatchOfp>
  /** Opens SimBrief's dispatch page in the default browser, pre-filled where possible. */
  dispatchOpenSimBrief: (simbriefAirframeId: string | null) => Promise<void>
  settingsGetSimbriefUsername: () => Promise<string | null>
  settingsSetSimbriefUsername: (username: string) => Promise<void>
  settingsGetWeightUnit: () => Promise<WeightUnit>
  settingsSetWeightUnit: (unit: WeightUnit) => Promise<void>
}
