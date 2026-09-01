import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IpcChannels, type AircraftUpdate } from '@shared/ipc'
import { createDb } from './db/client'
import { migrateDb } from './db/migrate'
import { createAircraft, deleteAircraft, listAircraft, updateAircraft } from './db/aircraft-repo'
import { parseAircraftInput } from './db/aircraft-validation'
import { exportAircraft, importAircraft } from './db/aircraft-import-export'
import { SimConnectService } from './sim/SimConnectService'

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => window.show())

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  const dbPath = join(app.getPath('userData'), 'flightdeck.db')
  migrateDb(dbPath)
  const { db } = createDb(dbPath)

  const window = createWindow()

  ipcMain.handle(IpcChannels.aircraftList, () => listAircraft(db))

  ipcMain.handle(IpcChannels.aircraftCreate, (_event, input: unknown) => {
    const result = parseAircraftInput(input)
    if ('error' in result) throw new Error(result.error)
    return createAircraft(db, result.data)
  })

  ipcMain.handle(IpcChannels.aircraftUpdate, (_event, input: AircraftUpdate) => {
    const { id, ...rest } = input
    const result = parseAircraftInput(rest)
    if ('error' in result) throw new Error(result.error)
    const updated = updateAircraft(db, { id, ...result.data })
    if (!updated) throw new Error(`Aircraft ${id} not found`)
    return updated
  })

  ipcMain.handle(IpcChannels.aircraftDelete, (_event, id: number) => {
    deleteAircraft(db, id)
  })

  ipcMain.handle(IpcChannels.aircraftImport, () => importAircraft(db, window))
  ipcMain.handle(IpcChannels.aircraftExport, () => exportAircraft(db, window))

  const simConnectService = new SimConnectService()
  ipcMain.handle(IpcChannels.simConnectionStatusGet, () => simConnectService.getStatus())
  simConnectService.on('telemetry', (telemetry) => {
    if (!window.isDestroyed()) window.webContents.send(IpcChannels.simTelemetry, telemetry)
  })
  simConnectService.on('status', (status) => {
    if (!window.isDestroyed()) window.webContents.send(IpcChannels.simConnectionStatus, status)
  })
  simConnectService.start()
  app.on('before-quit', () => simConnectService.stop())

  // CI packaging check (see .github/workflows/package.yml): proves the built
  // binary launches, migrates the DB and renders a first frame, then exits
  // clean — without needing a person at the keyboard on every platform.
  if (process.env['FLIGHTDECK_SMOKE_TEST']) {
    window.on('ready-to-show', () => setTimeout(() => app.exit(0), 1000))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
