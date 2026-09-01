import { useEffect, useState } from 'react'
import type { SimConnectionStatus, SimTelemetry, WeightUnit } from '@shared/ipc'
import { DispatchView } from './DispatchView'
import { FleetView } from './FleetView'
import { LogbookView } from './LogbookView'
import { TrackView } from './TrackView'

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

type Page = 'fleet' | 'dispatch' | 'track' | 'logbook'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('fleet')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb')
  const [simStatus, setSimStatus] = useState<SimConnectionStatus>({ state: 'disconnected' })
  const [telemetry, setTelemetry] = useState<SimTelemetry | null>(null)

  useEffect(() => {
    window.flightdeck.settingsGetWeightUnit().then(setWeightUnit)
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

  async function handleWeightUnitChange(unit: WeightUnit): Promise<void> {
    setWeightUnit(unit)
    await window.flightdeck.settingsSetWeightUnit(unit)
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <nav
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #ccc'
        }}
      >
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => setPage('fleet')}
            style={{ fontWeight: page === 'fleet' ? 'bold' : 'normal' }}
          >
            Fleet
          </button>
          <button
            type="button"
            onClick={() => setPage('dispatch')}
            style={{ fontWeight: page === 'dispatch' ? 'bold' : 'normal' }}
          >
            Dispatch
          </button>
          <button
            type="button"
            onClick={() => setPage('track')}
            style={{ fontWeight: page === 'track' ? 'bold' : 'normal' }}
          >
            Track
          </button>
          <button
            type="button"
            onClick={() => setPage('logbook')}
            style={{ fontWeight: page === 'logbook' ? 'bold' : 'normal' }}
          >
            Logbook
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem' }}>Weights:</span>
          {(['kg', 'lb'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => handleWeightUnitChange(unit)}
              style={{ fontWeight: weightUnit === unit ? 'bold' : 'normal' }}
            >
              {unit}
            </button>
          ))}
        </div>
      </nav>

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

      {page === 'fleet' && <FleetView />}
      {page === 'dispatch' && (
        <DispatchView weightUnit={weightUnit} onPlanned={() => setPage('track')} />
      )}
      {page === 'track' && <TrackView />}
      {page === 'logbook' && <LogbookView weightUnit={weightUnit} />}
    </main>
  )
}
