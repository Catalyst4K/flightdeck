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

export const IpcChannels = {
  aircraftList: 'aircraft:list',
  aircraftCreate: 'aircraft:create'
} as const

export interface FlightdeckApi {
  aircraftList: () => Promise<Aircraft[]>
  aircraftCreate: (aircraft: NewAircraft) => Promise<Aircraft>
}
