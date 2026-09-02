import { EventEmitter } from 'node:events'
import type { SimTelemetry } from '@shared/ipc'
import type { SimConnectService } from '../sim/SimConnectService'

// scripts/spike-flight-reload.ts, sim-confirmed against a real MSFS 2024 reload (see
// docs/decisions.md): loading a different flight produces roughly a minute of telemetry
// that individually *looks* plausible but isn't — `onGround` flips true a good ~30s
// before altitude has caught up, and altitude itself doesn't monotonically settle: it
// spikes to a garbage plateau (tens of thousands of feet) and holds there rock-steady
// for several seconds at a time before continuing to decay. So neither "onGround is
// true" nor "this value hasn't changed in N samples" is safe alone — both are required,
// plus a sanity ceiling on the absolute altitude, since the garbage plateaus sit far
// above any real airport's elevation.
const STABLE_SAMPLES_REQUIRED = 8
const MAX_PLAUSIBLE_GROUND_ALTITUDE_M = 3000 // ~9,800ft — comfortably above all but a handful of real airports worldwide, far below the reload spike's ~16,000-54,000ft garbage plateaus
const ALTITUDE_STABLE_EPSILON_M = 1.5
const POSITION_STABLE_EPSILON_DEG = 0.0005 // ~55m — stationary-at-gate jitter, not real taxi movement
const GROUND_SPEED_STABLE_EPSILON_MS = 0.3 // ~0.6kt

/**
 * Watches SimConnect telemetry after a flight is armed (Dispatch's "Fly" button) and
 * fires once the sim shows a genuinely settled, on-the-ground aircraft — the auto-start
 * half of "hopefully the Start tracking button is unnecessary". Requires several
 * consecutive seconds of plausible, unchanging data (on the ground, altitude under a
 * sanity ceiling, position and altitude both static) rather than trusting any single
 * sample — seeded on the real reload behaviour captured by scripts/spike-flight-reload.ts
 * (see docs/decisions.md), which showed that a mid-reload garbage plateau can otherwise
 * look "stable" for several ticks at a time.
 *
 * Earlier revision required an actual *disturbance* from the armed baseline before
 * counting stable samples, on the assumption a reload always happens after arming — but
 * Callum's real usage flow is often the other way round (load the flight in MSFS first,
 * *then* press Fly), so that precondition just meant it silently never fired. Dropped:
 * the reload-garbage window is already rejected on its own physical implausibility (not
 * on the ground yet, or altitude far too high, or still changing) — nothing about that
 * protection actually depended on requiring a disturbance first. The trade-off this
 * accepts: if the sim is left mid-transition from a *different* previous flight (stale
 * position at the wrong airport) for the full ~8s stability window right as Fly is
 * pressed, it could start against that stale data — a narrower risk than the one this
 * replaces, and Dispatch's own "Fly" confirmation dialog plus the manual "Start
 * tracking" button remain as guardrails against it.
 */
export class AutoStartDetector extends EventEmitter<{ ready: [number] }> {
  private armedFlightId: number | undefined
  private previous: SimTelemetry | undefined
  private stableCount = 0

  constructor(simConnectService: SimConnectService) {
    super()
    simConnectService.on('telemetry', (telemetry) => this.ingest(telemetry))
  }

  /**
   * Arms the watch for a freshly created flight. `currentTelemetry` (the sim's state at
   * the moment "Fly" was pressed) seeds the first delta comparison — if the sim isn't
   * connected yet, there's nothing to compare the first real sample against, so counting
   * starts from the sample after that one instead.
   */
  arm(flightId: number, currentTelemetry: SimTelemetry | undefined): void {
    this.armedFlightId = flightId
    this.previous = currentTelemetry
    this.stableCount = 0
  }

  /** Stops watching without firing — the armed flight was cancelled, or tracking already
   *  started some other way (e.g. the manual button) before this got there. */
  disarm(): void {
    this.armedFlightId = undefined
    this.previous = undefined
    this.stableCount = 0
  }

  private ingest(telemetry: SimTelemetry): void {
    if (this.armedFlightId === undefined) return

    this.stableCount = this.isStableStep(telemetry) ? this.stableCount + 1 : 0
    this.previous = telemetry

    if (this.stableCount >= STABLE_SAMPLES_REQUIRED) {
      const flightId = this.armedFlightId
      this.disarm()
      this.emit('ready', flightId)
    }
  }

  private isStableStep(telemetry: SimTelemetry): boolean {
    if (!telemetry.onGround) return false
    if (telemetry.latitude === 0 && telemetry.longitude === 0) return false
    if (telemetry.altitudeM > MAX_PLAUSIBLE_GROUND_ALTITUDE_M) return false
    if (Math.abs(telemetry.groundSpeedMs) > GROUND_SPEED_STABLE_EPSILON_MS) return false
    if (!this.previous) return false
    if (Math.abs(telemetry.latitude - this.previous.latitude) > POSITION_STABLE_EPSILON_DEG) return false
    if (Math.abs(telemetry.longitude - this.previous.longitude) > POSITION_STABLE_EPSILON_DEG) return false
    if (Math.abs(telemetry.altitudeM - this.previous.altitudeM) > ALTITUDE_STABLE_EPSILON_M) return false
    return true
  }
}
