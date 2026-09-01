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

/**
 * Live sim telemetry, in SI units throughout (meters, m/s, kg, degrees) per
 * docs/decisions.md §5 — convert to aviation units only at the UI layer.
 */
export interface SimTelemetry {
  latitude: number
  longitude: number
  altitudeM: number
  altitudeAglM: number
  verticalSpeedMs: number
  indicatedAirspeedMs: number
  trueAirspeedMs: number
  groundSpeedMs: number
  headingTrueDeg: number
  pitchDeg: number
  bankDeg: number
  onGround: boolean
  gForce: number
  fuelTotalKg: number
  totalWeightKg: number
  windSpeedMs: number
  windDirectionDeg: number
  engineCombustion1: boolean
  gearHandlePosition: number
  flapsHandleIndex: number
  parkingBrakeOn: boolean
  atcId: string
  atcModel: string
  title: string
  simRate: number
  slewActive: boolean
}

export type SimConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; simConnectVersion: string }

export const IpcChannels = {
  aircraftList: 'aircraft:list',
  aircraftCreate: 'aircraft:create',
  aircraftUpdate: 'aircraft:update',
  aircraftDelete: 'aircraft:delete',
  aircraftImport: 'aircraft:import',
  aircraftExport: 'aircraft:export',
  simTelemetry: 'sim:telemetry',
  simConnectionStatus: 'sim:connection-status',
  simConnectionStatusGet: 'sim:connection-status:get'
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
  /**
   * Current status, for a renderer mounting after the initial connect already happened —
   * `onSimConnectionStatus` only delivers *future* changes, since Electron doesn't replay
   * missed IPC pushes to a listener that subscribes late.
   */
  getSimConnectionStatus: () => Promise<SimConnectionStatus>
  onSimTelemetry: (listener: (telemetry: SimTelemetry) => void) => () => void
  onSimConnectionStatus: (listener: (status: SimConnectionStatus) => void) => () => void
}
