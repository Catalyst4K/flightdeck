import { useEffect, useState } from 'react'
import type { Aircraft, SimConnectionStatus, SimTelemetry } from '@shared/ipc'

const METERS_TO_FEET = 3.28084
const MS_TO_KNOTS = 1.94384

function connectionStatusLabel(status: SimConnectionStatus): string {
  switch (status.state) {
    case 'connected':
      return `Connected (SimConnect ${status.simConnectVersion})`
    case 'connecting':
      return 'Connecting…'
    case 'disconnected':
      return 'Disconnected — retrying'
  }
}

export default function App(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [registration, setRegistration] = useState('')
  const [icaoType, setIcaoType] = useState('')
  const [name, setName] = useState('')
  const [simStatus, setSimStatus] = useState<SimConnectionStatus>({ state: 'disconnected' })
  const [telemetry, setTelemetry] = useState<SimTelemetry | null>(null)

  useEffect(() => {
    window.flightdeck.aircraftList().then(setAircraft)
  }, [])

  useEffect(() => {
    // Pull current status in case the initial connect (main process starts it immediately
    // on app launch) already resolved before this component mounted — the push channel
    // below only delivers *future* changes, Electron doesn't replay missed IPC sends.
    window.flightdeck.getSimConnectionStatus().then(setSimStatus)
    const unsubscribeStatus = window.flightdeck.onSimConnectionStatus(setSimStatus)
    const unsubscribeTelemetry = window.flightdeck.onSimTelemetry(setTelemetry)
    return () => {
      unsubscribeStatus()
      unsubscribeTelemetry()
    }
  }, [])

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const created = await window.flightdeck.aircraftCreate({ registration, icaoType, name })
    setAircraft((current) => [...current, created])
    setRegistration('')
    setIcaoType('')
    setName('')
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>Flightdeck</h1>
      <p>M0 skeleton — this proves the DB round-trips through IPC.</p>

      <section style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h2 style={{ marginTop: 0 }}>Sim telemetry — {connectionStatusLabel(simStatus)}</h2>
        {telemetry ? (
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1rem' }}>
            <dt>Aircraft</dt>
            <dd>{telemetry.title}</dd>
            <dt>Altitude</dt>
            <dd>{Math.round(telemetry.altitudeM * METERS_TO_FEET)} ft</dd>
            <dt>IAS</dt>
            <dd>{Math.round(telemetry.indicatedAirspeedMs * MS_TO_KNOTS)} kt</dd>
            <dt>Heading</dt>
            <dd>{Math.round(telemetry.headingTrueDeg)}°</dd>
            <dt>On ground</dt>
            <dd>{telemetry.onGround ? 'Yes' : 'No'}</dd>
          </dl>
        ) : (
          <p>No data yet — waiting for MSFS.</p>
        )}
      </section>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          placeholder="Registration"
          value={registration}
          onChange={(e) => setRegistration(e.target.value)}
          required
        />
        <input placeholder="ICAO type" value={icaoType} onChange={(e) => setIcaoType(e.target.value)} required />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Add</button>
      </form>

      <ul>
        {aircraft.map((a) => (
          <li key={a.id}>
            {a.registration} — {a.icaoType} — {a.name}
          </li>
        ))}
      </ul>
    </main>
  )
}
