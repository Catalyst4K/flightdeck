/**
 * Typed IPC contract between main and renderer. The renderer only ever calls
 * these — no direct filesystem, network, or SimConnect access (see CLAUDE.md).
 */

export interface Aircraft {
  id: number
  registration: string
  icaoType: string
  name: string
  isActive: boolean
  createdAt: string
}

export interface NewAircraft {
  registration: string
  icaoType: string
  name: string
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
  simTelemetry: 'sim:telemetry',
  simConnectionStatus: 'sim:connection-status',
  simConnectionStatusGet: 'sim:connection-status:get'
} as const

export interface FlightdeckApi {
  aircraftList: () => Promise<Aircraft[]>
  aircraftCreate: (aircraft: NewAircraft) => Promise<Aircraft>
  /**
   * Current status, for a renderer mounting after the initial connect already happened —
   * `onSimConnectionStatus` only delivers *future* changes, since Electron doesn't replay
   * missed IPC pushes to a listener that subscribes late.
   */
  getSimConnectionStatus: () => Promise<SimConnectionStatus>
  onSimTelemetry: (listener: (telemetry: SimTelemetry) => void) => () => void
  onSimConnectionStatus: (listener: (status: SimConnectionStatus) => void) => () => void
}
