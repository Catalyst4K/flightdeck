import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import {
  IpcChannels,
  type AircraftUpdate,
  type DispatchOfp,
  type DispatchOpenSimBriefParams,
  type NewFlight,
  type WeightUnit
} from '@shared/ipc'
import { fetchAircraftByRegistration } from './aircraft-lookup/adsbdb-client'
import { searchAircraftTypes } from './aircraft-lookup/icao-types'
import { searchAirports } from './airports/airport-search'
import { buildAppMenu } from './menu'
import { createDb } from './db/client'
import { migrateDb } from './db/migrate'
import {
  createAircraft,
  deleteAircraft,
  getAircraftByRegistration,
  listAircraft,
  updateAircraft
} from './db/aircraft-repo'
import { parseAircraftInput } from './db/aircraft-validation'
import { exportAircraft, importAircraft } from './db/aircraft-import-export'
import {
  abandonAllPlanned,
  abandonFlight,
  createFlight,
  getFleetStats,
  listCompletedFlights,
  listFlights
} from './db/flight-repo'
import { importLogbookCsv } from './db/logbook-import'
import { getSimbriefUsername, getWeightUnit, setSimbriefUsername, setWeightUnit } from './db/settings-repo'
import { listTrackPoints } from './db/track-point-repo'
import { fetchLatestOfp } from './simbrief/simbrief-client'
import { SimConnectService } from './sim/SimConnectService'
import { TrackingController } from './tracking/TrackingController'

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

  Menu.setApplicationMenu(buildAppMenu())
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

  ipcMain.handle(IpcChannels.flightList, () => listFlights(db))

  ipcMain.handle(IpcChannels.dispatchFetchOfp, async (): Promise<DispatchOfp> => {
    const username = getSimbriefUsername(db)
    if (!username) throw new Error('Set your SimBrief username first')
    const ofp = await fetchLatestOfp(username)
    const matched = getAircraftByRegistration(db, ofp.aircraftRegistration)
    const { rawJson, ...rest } = ofp
    return { ...rest, ofpJson: rawJson, matchedAircraftId: matched?.id ?? null }
  })

  ipcMain.handle(IpcChannels.dispatchOpenSimBrief, (_event, params: DispatchOpenSimBriefParams) => {
    const { origIcao, destIcao, icaoType, simbriefAirframeId } = params
    if (!origIcao || !destIcao || (!icaoType && !simbriefAirframeId)) {
      return shell.openExternal('https://dispatch.simbrief.com/')
    }
    // `airframe=` takes priority when a saved SimBrief profile exists; otherwise `type=`
    // lets SimBrief fall back to its own default airframe for that type ICAO — SimBrief's
    // own behavior, nothing Flightdeck implements itself (docs/decisions.md).
    const airframeParam = simbriefAirframeId
      ? `airframe=${encodeURIComponent(simbriefAirframeId)}`
      : `type=${encodeURIComponent(icaoType)}`
    const url =
      `https://dispatch.simbrief.com/options/custom?orig=${encodeURIComponent(origIcao)}` +
      `&dest=${encodeURIComponent(destIcao)}&${airframeParam}`
    return shell.openExternal(url)
  })

  ipcMain.handle(IpcChannels.settingsGetSimbriefUsername, () => getSimbriefUsername(db) ?? null)
  ipcMain.handle(IpcChannels.settingsSetSimbriefUsername, (_event, username: string) =>
    setSimbriefUsername(db, username)
  )

  ipcMain.handle(IpcChannels.settingsGetWeightUnit, () => getWeightUnit(db))
  ipcMain.handle(IpcChannels.settingsSetWeightUnit, (_event, unit: WeightUnit) => setWeightUnit(db, unit))

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

  const trackingController = new TrackingController(db, simConnectService)
  trackingController.on('point', (point) => {
    if (!window.isDestroyed()) window.webContents.send(IpcChannels.trackingPoint, point)
  })

  ipcMain.handle(IpcChannels.trackingStart, (_event, flightId: number) => trackingController.start(flightId))
  ipcMain.handle(IpcChannels.trackingStop, () => trackingController.stop())
  ipcMain.handle(IpcChannels.trackingFinish, () => trackingController.finish())
  ipcMain.handle(IpcChannels.trackingGetActive, () => trackingController.getActive() ?? null)
  ipcMain.handle(IpcChannels.trackPointList, (_event, flightId: number) => listTrackPoints(db, flightId))

  // Only one flight is ever meant to be "in progress" (planned or active) at once —
  // pressing "Fly" on a new plan replaces whatever was already planned or being tracked,
  // rather than letting flights pile up alongside each other.
  ipcMain.handle(IpcChannels.flightCreate, (_event, input: NewFlight) => {
    trackingController.stop()
    abandonAllPlanned(db)
    return createFlight(db, input)
  })
  ipcMain.handle(IpcChannels.flightCancel, (_event, id: number) => {
    abandonFlight(db, id)
  })

  ipcMain.handle(IpcChannels.logbookListCompletedFlights, () => listCompletedFlights(db))
  ipcMain.handle(IpcChannels.logbookFleetStats, () => getFleetStats(db))
  ipcMain.handle(IpcChannels.logbookImportCsv, () => importLogbookCsv(db, window))

  ipcMain.handle(IpcChannels.aircraftLookupByRegistration, (_event, registration: string) =>
    fetchAircraftByRegistration(registration)
  )
  ipcMain.handle(IpcChannels.aircraftTypeSearch, (_event, query: string) => searchAircraftTypes(query))
  ipcMain.handle(IpcChannels.airportSearch, (_event, query: string) => searchAirports(query))

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
