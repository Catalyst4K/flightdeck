import { EventEmitter } from 'node:events'
import type { ActiveTracking, TrackPoint } from '@shared/ipc'
import type { FlightdeckDb } from '../db/client'
import { abandonFlight, completeFlight, getFlight, recordOff, recordOn, startFlight } from '../db/flight-repo'
import { createTrackPoint } from '../db/track-point-repo'
import type { SimConnectService } from '../sim/SimConnectService'
import { FlightRecorder } from './FlightRecorder'

interface TrackingControllerEvents {
  point: [TrackPoint]
}

/**
 * Bridges live SimConnectService telemetry to FlightRecorder's phase detection and
 * persistence — one flight tracked at a time, matching the app's single-window,
 * single-active-flight model. Subscribes to SimConnectService once at construction and
 * stays subscribed regardless of whether a flight is currently being tracked, so start()
 * doesn't race a telemetry tick that arrived just before it.
 */
export class TrackingController extends EventEmitter<TrackingControllerEvents> {
  private recorder: FlightRecorder | undefined
  private offRecorded = false
  private onRecorded = false

  constructor(
    private readonly db: FlightdeckDb,
    private readonly simConnectService: SimConnectService
  ) {
    super()
    this.simConnectService.on('telemetry', (telemetry) => {
      if (!this.recorder) return
      const result = this.recorder.ingest(telemetry, new Date())

      if (result.phase === 'climb' && !this.offRecorded) {
        this.offRecorded = true
        recordOff(this.db, this.recorder.getFlightId())
      }
      if (result.phase === 'landing' && !this.onRecorded) {
        this.onRecorded = true
        recordOn(this.db, this.recorder.getFlightId())
      }

      if (result.point) {
        const saved = createTrackPoint(this.db, result.point)
        this.emit('point', saved)
      }

      if (result.phase === 'shutdown') {
        completeFlight(this.db, this.recorder.getFlightId(), telemetry.fuelTotalKg)
        this.recorder = undefined
      }
    })
    this.simConnectService.on('paused', (paused) => this.recorder?.setPaused(paused))
  }

  getActive(): ActiveTracking | undefined {
    return this.recorder
      ? { flightId: this.recorder.getFlightId(), phase: this.recorder.getPhase() }
      : undefined
  }

  start(flightId: number): void {
    if (this.recorder) throw new Error(`Already tracking flight ${this.recorder.getFlightId()}`)
    if (!getFlight(this.db, flightId)) throw new Error(`Flight ${flightId} not found`)

    const telemetry = this.simConnectService.getLastTelemetry()
    if (!telemetry) throw new Error('Not connected to the sim')

    startFlight(this.db, flightId, telemetry.fuelTotalKg)
    this.recorder = new FlightRecorder(flightId)
    this.offRecorded = false
    this.onRecorded = false
  }

  /** User cancelled tracking mid-flight, rather than reaching shutdown naturally. */
  stop(): void {
    if (!this.recorder) return
    abandonFlight(this.db, this.recorder.getFlightId())
    this.recorder = undefined
  }
}
