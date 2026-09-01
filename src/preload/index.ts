import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannels,
  type FlightdeckApi,
  type NewAircraft,
  type SimConnectionStatus,
  type SimTelemetry
} from '@shared/ipc'

const api: FlightdeckApi = {
  aircraftList: () => ipcRenderer.invoke(IpcChannels.aircraftList),
  aircraftCreate: (aircraft: NewAircraft) => ipcRenderer.invoke(IpcChannels.aircraftCreate, aircraft),
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
  }
}

contextBridge.exposeInMainWorld('flightdeck', api)
