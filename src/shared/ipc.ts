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

/** Result of a registration lookup (docs/decisions.md, adsbdb) — null means not found. */
export interface AircraftLookupResult {
  icaoType: string
  operator: string | null
  name: string
}

/** One match from the vendored ICAO Doc 8643 type-designator list (see resources/). */
export interface AircraftTypeOption {
  manufacturer: string
  model: string
  icaoType: string
  wakeCat: string
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
  { state: 'disconnected' } | { state: 'connecting' } | { state: 'connected'; simConnectVersion: string }

export type FlightStatus = 'planned' | 'active' | 'completed' | 'abandoned'

/** PLAN.md §1: pushback → taxi → takeoff → climb → cruise → descent → landing → shutdown. */
export type FlightPhase =
  'preflight' | 'pushback' | 'taxi' | 'takeoff' | 'climb' | 'cruise' | 'descent' | 'landing' | 'shutdown'

/**
 * One recorded sample of an active flight. SI units throughout per §5 — convert only at
 * the UI layer. Sparse by design (PLAN.md §5): downsampled to one point per ~15s during
 * cruise, full rate (the sim feed's own 1 Hz) everywhere else.
 */
export interface TrackPoint {
  id: number
  flightId: number
  tsUtc: string
  latitude: number
  longitude: number
  altitudeM: number
  altitudeAglM: number
  indicatedAirspeedMs: number
  groundSpeedMs: number
  verticalSpeedMs: number
  headingTrueDeg: number
  pitchDeg: number
  bankDeg: number
  phase: FlightPhase
  onGround: boolean
  fuelKg: number
}

export type NewTrackPoint = Omit<TrackPoint, 'id'>

export interface ActiveTracking {
  flightId: number
  phase: FlightPhase
}

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

/** One row per aircraft with at least one completed flight — see flight-repo.ts. */
export interface FleetStats {
  aircraftId: number
  registration: string
  totalHours: number
  totalCycles: number
  lastArrIcao: string
  lastFlightInUtc: string | null
}

export interface LogbookImportSkip {
  label: string
  reason: string
}

export interface LogbookImportSummary {
  imported: number
  /** Aircraft auto-created for a registration not already in the fleet — see logbook-import.ts. */
  aircraftCreated: number
  skipped: LogbookImportSkip[]
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
  simTelemetry: 'sim:telemetry',
  simConnectionStatus: 'sim:connection-status',
  simConnectionStatusGet: 'sim:connection-status:get',
  flightList: 'flight:list',
  flightCreate: 'flight:create',
  dispatchFetchOfp: 'dispatch:fetch-ofp',
  dispatchOpenSimBrief: 'dispatch:open-simbrief',
  settingsGetSimbriefUsername: 'settings:get-simbrief-username',
  settingsSetSimbriefUsername: 'settings:set-simbrief-username',
  settingsGetWeightUnit: 'settings:get-weight-unit',
  settingsSetWeightUnit: 'settings:set-weight-unit',
  trackingStart: 'tracking:start',
  trackingStop: 'tracking:stop',
  trackingGetActive: 'tracking:get-active',
  trackingPoint: 'tracking:point',
  trackPointList: 'track-point:list',
  logbookListCompletedFlights: 'logbook:list-completed-flights',
  logbookFleetStats: 'logbook:fleet-stats',
  logbookImportCsv: 'logbook:import-csv',
  aircraftLookupByRegistration: 'aircraft:lookup-by-registration',
  aircraftTypeSearch: 'aircraft:type-search'
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
  /** Begins tracking a planned flight. Throws if the sim isn't connected or another flight is already tracked. */
  trackingStart: (flightId: number) => Promise<void>
  /** Cancels tracking mid-flight; marks the flight 'abandoned' rather than 'completed'. */
  trackingStop: () => Promise<void>
  trackingGetActive: () => Promise<ActiveTracking | null>
  trackPointList: (flightId: number) => Promise<TrackPoint[]>
  onTrackingPoint: (listener: (point: TrackPoint) => void) => () => void
  logbookListCompletedFlights: () => Promise<Flight[]>
  logbookFleetStats: () => Promise<FleetStats[]>
  /** Opens a native file-open dialog in the main process; null if the user cancels. */
  logbookImportCsv: () => Promise<LogbookImportSummary | null>
  /** Looks up an aircraft by registration via adsbdb.com. Null if not found (not an error). */
  aircraftLookupByRegistration: (registration: string) => Promise<AircraftLookupResult | null>
  /** Searches the vendored ICAO Doc 8643 type-designator list. Empty for a query under 2 chars. */
  aircraftTypeSearch: (query: string) => Promise<AircraftTypeOption[]>
}
