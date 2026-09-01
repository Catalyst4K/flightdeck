import type { FlightdeckApi } from '@shared/ipc'

declare global {
  interface Window {
    flightdeck: FlightdeckApi
  }
}
