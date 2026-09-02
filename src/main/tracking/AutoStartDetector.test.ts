import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import type { SimTelemetry } from '@shared/ipc'
import type { SimConnectService } from '../sim/SimConnectService'
import { AutoStartDetector } from './AutoStartDetector'

function telemetry(overrides: Partial<SimTelemetry>): SimTelemetry {
  return {
    latitude: 51.4775,
    longitude: -0.4614,
    altitudeM: 25,
    altitudeAglM: 0,
    verticalSpeedMs: 0,
    indicatedAirspeedMs: 0,
    trueAirspeedMs: 0,
    groundSpeedMs: 0,
    headingTrueDeg: 270,
    pitchDeg: 0,
    bankDeg: 0,
    onGround: true,
    gForce: 1,
    fuelTotalKg: 10000,
    totalWeightKg: 70000,
    windSpeedMs: 3,
    windDirectionDeg: 250,
    engineCombustion1: false,
    gearHandlePosition: 1,
    flapsHandleIndex: 0,
    parkingBrakeOn: true,
    atcId: 'TEST',
    atcModel: 'A320',
    title: 'FenixA320 IAE SL',
    simRate: 1,
    slewActive: false,
    ...overrides
  }
}

/** A minimal SimConnectService double: just needs to be a real EventEmitter to `.on('telemetry', ...)` against. */
function fakeSimConnectService(): SimConnectService {
  return new EventEmitter() as unknown as SimConnectService
}

describe('AutoStartDetector', () => {
  it('never fires while unarmed', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    for (let i = 0; i < 20; i++) sim.emit('telemetry', telemetry({}))

    expect(fired).toEqual([])
  })

  it('fires quickly when the sim is already settled at arm time (loaded the flight in MSFS before pressing Fly)', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, telemetry({}))
    for (let i = 0; i < 7; i++) {
      sim.emit('telemetry', telemetry({}))
      expect(fired).toEqual([]) // not yet — needs the full run
    }
    sim.emit('telemetry', telemetry({}))

    expect(fired).toEqual([1])
  })

  it('does not count samples while onGround is false', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, telemetry({ onGround: false }))
    for (let i = 0; i < 15; i++) sim.emit('telemetry', telemetry({ onGround: false }))

    expect(fired).toEqual([])
  })

  it('rejects an unchanging-but-implausible altitude plateau (the real reload false-positive trap)', () => {
    // Sim-confirmed against a live MSFS 2024 reload (docs/decisions.md): mid-reload,
    // onGround flips true while altitude is still garbage, and that garbage altitude
    // holds rock-steady at ~53,774ft for several consecutive seconds before continuing to
    // decay. A naive "on ground + unchanged" check would have fired right there.
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    const plateauM = 16391 // ~53,774ft
    detector.arm(1, telemetry({ onGround: true, altitudeM: plateauM }))
    for (let i = 0; i < 12; i++) {
      sim.emit('telemetry', telemetry({ onGround: true, altitudeM: plateauM }))
    }

    expect(fired).toEqual([])
  })

  it('fires once a reload finishes decaying and genuinely settles', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, telemetry({ onGround: false, altitudeM: 16400 }))
    // A decaying tail, same shape as the real log — each step is too big to count as stable.
    for (const altitudeM of [1335, 664, 253, 44, 24]) {
      sim.emit('telemetry', telemetry({ onGround: true, altitudeM }))
    }
    expect(fired).toEqual([])

    // Now it actually settles at real field elevation.
    for (let i = 0; i < 8; i++) {
      sim.emit('telemetry', telemetry({ onGround: true, altitudeM: 24 }))
    }

    expect(fired).toEqual([1])
  })

  it('resets the stable count when a real value keeps changing', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, telemetry({ altitudeM: 24 }))
    for (let i = 0; i < 3; i++) sim.emit('telemetry', telemetry({ altitudeM: 24 }))
    sim.emit('telemetry', telemetry({ altitudeM: 40 })) // a real jump — resets the count
    for (let i = 0; i < 7; i++) sim.emit('telemetry', telemetry({ altitudeM: 40 }))

    expect(fired).toEqual([]) // only 7 consecutive since the jump, one short of the required 8
    sim.emit('telemetry', telemetry({ altitudeM: 40 }))
    expect(fired).toEqual([1])
  })

  it('does not fire on the very first sample after arming with no prior telemetry (nothing to diff against yet)', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, undefined)
    // The first emit has no `previous` to compare against, so it doesn't count — 9 total
    // emits are needed to accumulate 8 stable samples after it.
    for (let i = 0; i < 9; i++) sim.emit('telemetry', telemetry({}))

    expect(fired).toEqual([1])
  })

  it('disarm() stops a pending watch from ever firing', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, telemetry({}))
    sim.emit('telemetry', telemetry({}))
    sim.emit('telemetry', telemetry({}))
    detector.disarm()
    for (let i = 0; i < 10; i++) sim.emit('telemetry', telemetry({}))

    expect(fired).toEqual([])
  })

  it('re-arming for a new flight replaces the previous watch', () => {
    const sim = fakeSimConnectService()
    const detector = new AutoStartDetector(sim)
    const fired: number[] = []
    detector.on('ready', (id) => fired.push(id))

    detector.arm(1, telemetry({}))
    sim.emit('telemetry', telemetry({}))
    sim.emit('telemetry', telemetry({}))
    detector.arm(2, telemetry({}))
    for (let i = 0; i < 8; i++) sim.emit('telemetry', telemetry({}))

    expect(fired).toEqual([2])
  })
})
