import { useEffect, useState } from 'react'
import type { Aircraft, AircraftImportSummary, FleetStats, NewAircraft } from '@shared/ipc'
import { AircraftForm } from './AircraftForm'

type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'new' } | { kind: 'edit'; id: number }

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function AircraftDetail(props: {
  aircraft: Aircraft
  stats: FleetStats | undefined
  onEdit: () => void
  onDelete: () => void
  onBack: () => void
}): React.JSX.Element {
  const a = props.aircraft
  const s = props.stats
  return (
    <div style={{ maxWidth: 480 }}>
      <button type="button" onClick={props.onBack}>
        ← Back to fleet
      </button>
      <h2>
        {a.registration} — {a.icaoType}
      </h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1.5rem' }}>
        <dt>Airline</dt>
        <dd>{a.operator ?? '—'}</dd>
        <dt>SimBrief profile</dt>
        <dd>{a.simbriefAirframeId ?? '—'}</dd>
        <dt>Current ICAO</dt>
        <dd>{a.currentIcao ?? '—'}</dd>
        <dt>Total hours</dt>
        <dd>{s ? s.totalHours.toFixed(1) : '0.0'}</dd>
        <dt>Total cycles</dt>
        <dd>{s?.totalCycles ?? 0}</dd>
        <dt>Last location</dt>
        <dd>{s?.lastArrIcao ?? '—'}</dd>
        <dt>Last flight</dt>
        <dd>{formatDate(s?.lastFlightInUtc ?? null)}</dd>
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

export function FleetView(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [stats, setStats] = useState<FleetStats[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [importSummary, setImportSummary] = useState<AircraftImportSummary | null>(null)

  function reload(): Promise<void> {
    return Promise.all([window.flightdeck.aircraftList(), window.flightdeck.logbookFleetStats()]).then(
      ([aircraftList, fleetStats]) => {
        setAircraft(aircraftList)
        setStats(fleetStats)
      }
    )
  }

  useEffect(() => {
    reload()
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
      <div>
        <h1>New aircraft</h1>
        <AircraftForm onSubmit={handleCreate} onCancel={() => setView({ kind: 'list' })} />
      </div>
    )
  }

  if (view.kind === 'edit') {
    const existing = aircraft.find((a) => a.id === view.id)
    if (!existing) return <p>Aircraft not found.</p>
    return (
      <div>
        <h1>Edit {existing.registration}</h1>
        <AircraftForm
          initial={existing}
          onSubmit={(data) => handleUpdate(view.id, data)}
          onCancel={() => setView({ kind: 'detail', id: view.id })}
        />
      </div>
    )
  }

  if (view.kind === 'detail') {
    const existing = aircraft.find((a) => a.id === view.id)
    if (!existing) return <p>Aircraft not found.</p>
    return (
      <AircraftDetail
        aircraft={existing}
        stats={stats.find((s) => s.aircraftId === existing.id)}
        onEdit={() => setView({ kind: 'edit', id: view.id })}
        onDelete={() => handleDelete(view.id)}
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }

  return (
    <div>
      <h1>Fleet</h1>

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
              <th>Airline</th>
              <th>Hours</th>
              <th>Cycles</th>
            </tr>
          </thead>
          <tbody>
            {aircraft.map((a) => {
              const s = stats.find((stat) => stat.aircraftId === a.id)
              return (
                <tr
                  key={a.id}
                  onClick={() => setView({ kind: 'detail', id: a.id })}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                >
                  <td>{a.registration}</td>
                  <td>{a.icaoType}</td>
                  <td>{a.operator ?? '—'}</td>
                  <td>{s ? s.totalHours.toFixed(1) : '0.0'}</td>
                  <td>{s?.totalCycles ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
