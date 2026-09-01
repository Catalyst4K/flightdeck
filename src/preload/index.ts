import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannels,
  type AircraftUpdate,
  type FlightdeckApi,
  type NewAircraft,
  type NewFlight
} from '@shared/ipc'

const api: FlightdeckApi = {
  aircraftList: () => ipcRenderer.invoke(IpcChannels.aircraftList),
  aircraftCreate: (aircraft: NewAircraft) => ipcRenderer.invoke(IpcChannels.aircraftCreate, aircraft),
  aircraftUpdate: (aircraft: AircraftUpdate) => ipcRenderer.invoke(IpcChannels.aircraftUpdate, aircraft),
  aircraftDelete: (id: number) => ipcRenderer.invoke(IpcChannels.aircraftDelete, id),
  aircraftImport: () => ipcRenderer.invoke(IpcChannels.aircraftImport),
  aircraftExport: () => ipcRenderer.invoke(IpcChannels.aircraftExport),
  flightList: () => ipcRenderer.invoke(IpcChannels.flightList),
  flightCreate: (flight: NewFlight) => ipcRenderer.invoke(IpcChannels.flightCreate, flight),
  dispatchFetchOfp: () => ipcRenderer.invoke(IpcChannels.dispatchFetchOfp),
  dispatchOpenSimBrief: (simbriefAirframeId: string | null) =>
    ipcRenderer.invoke(IpcChannels.dispatchOpenSimBrief, simbriefAirframeId),
  settingsGetSimbriefUsername: () => ipcRenderer.invoke(IpcChannels.settingsGetSimbriefUsername),
  settingsSetSimbriefUsername: (username: string) =>
    ipcRenderer.invoke(IpcChannels.settingsSetSimbriefUsername, username)
}

contextBridge.exposeInMainWorld('flightdeck', api)
