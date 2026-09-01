import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannels,
  type AircraftUpdate,
  type AppPage,
  type DispatchOpenSimBriefParams,
  type FlightdeckApi,
  type NewAircraft,
  type NewFlight,
  type SimConnectionStatus,
  type SimTelemetry,
  type TrackPoint,
  type WeightUnit
} from '@shared/ipc'

const api: FlightdeckApi = {
  aircraftList: () => ipcRenderer.invoke(IpcChannels.aircraftList),
  aircraftCreate: (aircraft: NewAircraft) => ipcRenderer.invoke(IpcChannels.aircraftCreate, aircraft),
  aircraftUpdate: (aircraft: AircraftUpdate) => ipcRenderer.invoke(IpcChannels.aircraftUpdate, aircraft),
  aircraftDelete: (id: number) => ipcRenderer.invoke(IpcChannels.aircraftDelete, id),
  aircraftImport: () => ipcRenderer.invoke(IpcChannels.aircraftImport),
  aircraftExport: () => ipcRenderer.invoke(IpcChannels.aircraftExport),
  getSimConnectionStatus: () => ipcRenderer.invoke(IpcChannels.simConnectionStatusGet),
  onSimTelemetry: (listener: (telemetry: SimTelemetry) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, telemetry: SimTelemetry): void => listener(telemetry)
    ipcRenderer.on(IpcChannels.simTelemetry, handler)
    return () => ipcRenderer.removeListener(IpcChannels.simTelemetry, handler)
  },
  onSimConnectionStatus: (listener: (status: SimConnectionStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: SimConnectionStatus): void => listener(status)
    ipcRenderer.on(IpcChannels.simConnectionStatus, handler)
    return () => ipcRenderer.removeListener(IpcChannels.simConnectionStatus, handler)
  },
  flightList: () => ipcRenderer.invoke(IpcChannels.flightList),
  flightCreate: (flight: NewFlight) => ipcRenderer.invoke(IpcChannels.flightCreate, flight),
  flightCancel: (id: number) => ipcRenderer.invoke(IpcChannels.flightCancel, id),
  dispatchFetchOfp: () => ipcRenderer.invoke(IpcChannels.dispatchFetchOfp),
  dispatchOpenSimBrief: (params: DispatchOpenSimBriefParams) =>
    ipcRenderer.invoke(IpcChannels.dispatchOpenSimBrief, params),
  settingsGetSimbriefUsername: () => ipcRenderer.invoke(IpcChannels.settingsGetSimbriefUsername),
  settingsSetSimbriefUsername: (username: string) =>
    ipcRenderer.invoke(IpcChannels.settingsSetSimbriefUsername, username),
  settingsGetWeightUnit: () => ipcRenderer.invoke(IpcChannels.settingsGetWeightUnit),
  settingsSetWeightUnit: (unit: WeightUnit) => ipcRenderer.invoke(IpcChannels.settingsSetWeightUnit, unit),
  trackingStart: (flightId: number) => ipcRenderer.invoke(IpcChannels.trackingStart, flightId),
  trackingStop: () => ipcRenderer.invoke(IpcChannels.trackingStop),
  trackingFinish: () => ipcRenderer.invoke(IpcChannels.trackingFinish),
  trackingGetActive: () => ipcRenderer.invoke(IpcChannels.trackingGetActive),
  trackPointList: (flightId: number) => ipcRenderer.invoke(IpcChannels.trackPointList, flightId),
  onTrackingPoint: (listener: (point: TrackPoint) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, point: TrackPoint): void => listener(point)
    ipcRenderer.on(IpcChannels.trackingPoint, handler)
    return () => ipcRenderer.removeListener(IpcChannels.trackingPoint, handler)
  },
  logbookListCompletedFlights: () => ipcRenderer.invoke(IpcChannels.logbookListCompletedFlights),
  logbookFleetStats: () => ipcRenderer.invoke(IpcChannels.logbookFleetStats),
  logbookImportCsv: () => ipcRenderer.invoke(IpcChannels.logbookImportCsv),
  aircraftLookupByRegistration: (registration: string) =>
    ipcRenderer.invoke(IpcChannels.aircraftLookupByRegistration, registration),
  aircraftTypeSearch: (query: string) => ipcRenderer.invoke(IpcChannels.aircraftTypeSearch, query),
  airportSearch: (query: string) => ipcRenderer.invoke(IpcChannels.airportSearch, query),
  onMenuNavigate: (listener: (page: AppPage) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, page: AppPage): void => listener(page)
    ipcRenderer.on(IpcChannels.menuNavigate, handler)
    return () => ipcRenderer.removeListener(IpcChannels.menuNavigate, handler)
  }
}

contextBridge.exposeInMainWorld('flightdeck', api)
