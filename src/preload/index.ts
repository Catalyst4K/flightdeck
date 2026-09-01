import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type FlightdeckApi, type NewAircraft } from '@shared/ipc'

const api: FlightdeckApi = {
  aircraftList: () => ipcRenderer.invoke(IpcChannels.aircraftList),
  aircraftCreate: (aircraft: NewAircraft) => ipcRenderer.invoke(IpcChannels.aircraftCreate, aircraft)
}

contextBridge.exposeInMainWorld('flightdeck', api)
