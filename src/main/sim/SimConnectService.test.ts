import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawBuffer } from 'node-simconnect'
import type { SimConnectionStatus, SimTelemetry } from '@shared/ipc'
import { SimConnectService, type OpenSimConnect } from './SimConnectService'

/** A RawBuffer double: every read method returns a fixed, type-appropriate value. */
function fakeRawBuffer(): RawBuffer {
  return {
    readFloat64: () => 42,
    readInt32: () => 1,
    readString32: () => 'TEST',
    readString128: () => 'Test Aircraft'
  } as unknown as RawBuffer
}

function fakeHandle(): EventEmitter & {
  close: () => void
  addToDataDefinition: () => void
  requestDataOnSimObject: () => void
  subscribeToSystemEvent: () => void
} {
  const emitter = new EventEmitter() as EventEmitter & {
    close: () => void
    addToDataDefinition: () => void
    requestDataOnSimObject: () => void
    subscribeToSystemEvent: () => void
  }
  emitter.close = vi.fn()
  emitter.addToDataDefinition = vi.fn()
  emitter.requestDataOnSimObject = vi.fn()
  emitter.subscribeToSystemEvent = vi.fn()
  return emitter
}

describe('SimConnectService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits connected status and telemetry once the sim responds', async () => {
    const handle = fakeHandle()
    const openSimConnect = vi.fn(async () => ({
      recvOpen: { simConnectVersionMajor: 12, simConnectVersionMinor: 2 },
      handle
    })) as unknown as OpenSimConnect

    const service = new SimConnectService(openSimConnect)
    const statuses: SimConnectionStatus[] = []
    const telemetry: SimTelemetry[] = []
    service.on('status', (status) => statuses.push(status))
    service.on('telemetry', (t) => telemetry.push(t))

    service.start()
    await vi.waitFor(() => expect(openSimConnect).toHaveBeenCalledTimes(1))

    expect(statuses).toEqual([{ state: 'connecting' }, { state: 'connected', simConnectVersion: '12.2' }])
    expect(handle.addToDataDefinition).toHaveBeenCalled()
    expect(handle.requestDataOnSimObject).toHaveBeenCalled()
    expect(service.getStatus()).toEqual({ state: 'connected', simConnectVersion: '12.2' })

    handle.emit('simObjectData', { requestID: 0, data: fakeRawBuffer() })

    expect(telemetry).toHaveLength(1)
    expect(telemetry[0].title).toBe('Test Aircraft')
    expect(telemetry[0].onGround).toBe(true)
    expect(service.getLastTelemetry()).toEqual(telemetry[0])

    service.stop()
  })

  it('subscribes to the Pause system event and forwards it', async () => {
    const handle = fakeHandle()
    const openSimConnect = vi.fn(async () => ({
      recvOpen: { simConnectVersionMajor: 12, simConnectVersionMinor: 2 },
      handle
    })) as unknown as OpenSimConnect

    const service = new SimConnectService(openSimConnect)
    const paused: boolean[] = []
    service.on('paused', (p) => paused.push(p))

    service.start()
    await vi.waitFor(() => expect(handle.subscribeToSystemEvent).toHaveBeenCalled())

    handle.emit('event', { clientEventId: 1, data: 1 })
    handle.emit('event', { clientEventId: 1, data: 0 })
    handle.emit('event', { clientEventId: 999, data: 1 }) // unrelated event, ignored

    expect(paused).toEqual([true, false])
    service.stop()
  })

  it('retries with backoff when the sim is not running, and stops retrying once stopped', async () => {
    const openSimConnect = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })

    const service = new SimConnectService(openSimConnect as unknown as OpenSimConnect)
    service.start()
    await vi.waitFor(() => expect(openSimConnect).toHaveBeenCalledTimes(1))

    await vi.advanceTimersByTimeAsync(2_000)
    expect(openSimConnect).toHaveBeenCalledTimes(2)

    service.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(openSimConnect).toHaveBeenCalledTimes(2)
  })

  it('reconnects automatically if the sim quits', async () => {
    const firstHandle = fakeHandle()
    const secondHandle = fakeHandle()
    const openSimConnect = vi
      .fn()
      .mockResolvedValueOnce({
        recvOpen: { simConnectVersionMajor: 12, simConnectVersionMinor: 2 },
        handle: firstHandle
      })
      .mockResolvedValueOnce({
        recvOpen: { simConnectVersionMajor: 12, simConnectVersionMinor: 2 },
        handle: secondHandle
      }) as unknown as OpenSimConnect

    const service = new SimConnectService(openSimConnect)
    const statuses: SimConnectionStatus[] = []
    service.on('status', (status) => statuses.push(status))

    service.start()
    await vi.waitFor(() => expect(openSimConnect).toHaveBeenCalledTimes(1))

    firstHandle.emit('quit')
    expect(statuses.at(-1)).toEqual({ state: 'disconnected' })

    await vi.advanceTimersByTimeAsync(2_000)
    await vi.waitFor(() => expect(openSimConnect).toHaveBeenCalledTimes(2))
    expect(statuses.at(-1)).toEqual({ state: 'connected', simConnectVersion: '12.2' })

    service.stop()
  })
})
