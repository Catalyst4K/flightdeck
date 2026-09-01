import { useEffect, useState } from 'react'
import type { Aircraft, AircraftImportSummary, NewAircraft, SimConnectionStatus, SimTelemetry } from '@shared/ipc'
import { AircraftForm } from './AircraftForm'
import { kgToLb } from './units'

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

type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'new' } | { kind: 'edit'; id: number }

function formatLb(kg: number | null): string {
  return kg == null ? '—' : `${Math.round(kgToLb(kg)).toLocaleString()} lb`
}

function AircraftDetail(props: {
  aircraft: Aircraft
  onEdit: () => void
  onDelete: () => void
  onBack: () => void
}): React.JSX.Element {
  const a = props.aircraft
  return (
    <div style={{ maxWidth: 720 }}>
      <button type="button" onClick={props.onBack}>
        ← Back to fleet
      </button>
      <h2>
        {a.registration} — {a.icaoType}
      </h2>
      <p>{a.name}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1.5rem' }}>
        <dt>Operator</dt>
        <dd>{a.operator ?? '—'}</dd>
        <dt>Livery</dt>
        <dd>{a.livery ?? '—'}</dd>
        <dt>SimBrief airframe</dt>
        <dd>{a.simbriefAirframeId ?? '—'}</dd>
        <dt>OEW</dt>
        <dd>{formatLb(a.oewKg)}</dd>
        <dt>MZFW</dt>
        <dd>{formatLb(a.mzfwKg)}</dd>
        <dt>MTOW</dt>
        <dd>{formatLb(a.mtowKg)}</dd>
        <dt>MLW</dt>
        <dd>{formatLb(a.mlwKg)}</dd>
        <dt>Max fuel</dt>
        <dd>{formatLb(a.maxFuelKg)}</dd>
        <dt>Max pax</dt>
        <dd>{a.maxPax ?? '—'}</dd>
        <dt>Equip</dt>
        <dd>{a.equip ?? '—'}</dd>
        <dt>Transponder</dt>
        <dd>{a.transponder ?? '—'}</dd>
        <dt>PBN</dt>
        <dd>{a.pbn ?? '—'}</dd>
        <dt>Wake category</dt>
        <dd>{a.wakeCat ?? '—'}</dd>
        <dt>Current ICAO</dt>
        <dd>{a.currentIcao ?? '—'}</dd>
        <dt>Total hours</dt>
        <dd>{a.totalHours}</dd>
        <dt>Total cycles</dt>
        <dd>{a.totalCycles}</dd>
        <dt>Active</dt>
        <dd>{a.isActive ? 'Yes' : 'No'}</dd>
        <dt>Notes</dt>
        <dd>{a.notes ?? '—'}</dd>
      </dl>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" onClick={props.onEdit}>
          Edit
        </button>
        <button type="button" onClick={props.onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [importSummary, setImportSummary] = useState<AircraftImportSummary | null>(null)
  const [simStatus, setSimStatus] = useState<SimConnectionStatus>({ state: 'disconnected' })
  const [telemetry, setTelemetry] = useState<SimTelemetry | null>(null)

  function reload(): Promise<void> {
    return window.flightdeck.aircraftList().then(setAircraft)
  }

  useEffect(() => {
    reload()
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

  async function handleCreate(data: NewAircraft): Promise<void> {
    await window.flightdeck.aircraftCreate(data)
    await reload()
    setView({ kind: 'list' })
  }

  async function handleUpdate(id: number, data: NewAircraft): Promise<void> {
    await window.flightdeck.aircraftUpdate({ id, ...data })
    await reload()
    setView({ kind: 'detail', id })
  }

  async function handleDelete(id: number): Promise<void> {
    if (!confirm('Delete this aircraft? This cannot be undone.')) return
    await window.flightdeck.aircraftDelete(id)
    await reload()
    setView({ kind: 'list' })
  }

  async function handleImport(): Promise<void> {
    const summary = await window.flightdeck.aircraftImport()
    if (summary) {
      setImportSummary(summary)
      await reload()
    }
  }

  async function handleExport(): Promise<void> {
    await window.flightdeck.aircraftExport()
  }

  if (view.kind === 'new') {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <h1>New aircraft</h1>
        <AircraftForm onSubmit={handleCreate} onCancel={() => setView({ kind: 'list' })} />
      </main>
    )
  }

  if (view.kind === 'edit') {
    const existing = aircraft.find((a) => a.id === view.id)
    if (!existing) return <p>Aircraft not found.</p>
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <h1>Edit {existing.registration}</h1>
        <AircraftForm
          initial={existing}
          onSubmit={(data) => handleUpdate(view.id, data)}
          onCancel={() => setView({ kind: 'detail', id: view.id })}
        />
      </main>
    )
  }

  if (view.kind === 'detail') {
    const existing = aircraft.find((a) => a.id === view.id)
    if (!existing) return <p>Aircraft not found.</p>
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <AircraftDetail
          aircraft={existing}
          onEdit={() => setView({ kind: 'edit', id: view.id })}
          onDelete={() => handleDelete(view.id)}
          onBack={() => setView({ kind: 'list' })}
        />
      </main>
    )
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Flightdeck — Fleet</h1>

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

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => setView({ kind: 'new' })}>
          New aircraft
        </button>
        <button type="button" onClick={handleImport}>
          Import JSON
        </button>
        <button type="button" onClick={handleExport}>
          Export JSON
        </button>
      </div>

      {importSummary && (
        <p>
          Imported {importSummary.imported} aircraft.
          {importSummary.skipped.length > 0 && (
            <>
              {' '}
              Skipped {importSummary.skipped.length}:{' '}
              {importSummary.skipped.map((s) => `${s.registration} (${s.reason})`).join(', ')}
            </>
          )}
        </p>
      )}

      {aircraft.length === 0 ? (
        <p>No aircraft yet — add one or import a fleet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th>Registration</th>
              <th>Type</th>
              <th>Name</th>
              <th>Operator</th>
              <th>Hours</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {aircraft.map((a) => (
              <tr
                key={a.id}
                onClick={() => setView({ kind: 'detail', id: a.id })}
                style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
              >
                <td>{a.registration}</td>
                <td>{a.icaoType}</td>
                <td>{a.name}</td>
                <td>{a.operator ?? '—'}</td>
                <td>{a.totalHours}</td>
                <td>{a.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
