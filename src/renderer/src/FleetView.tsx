import { useEffect, useState } from 'react'
import type { Aircraft, AircraftImportSummary, NewAircraft, WeightUnit } from '@shared/ipc'
import { AircraftForm } from './AircraftForm'
import { formatWeight } from './units'

type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'new' } | { kind: 'edit'; id: number }

function AircraftDetail(props: {
  aircraft: Aircraft
  weightUnit: WeightUnit
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
        <dd>{formatWeight(a.oewKg, props.weightUnit)}</dd>
        <dt>MZFW</dt>
        <dd>{formatWeight(a.mzfwKg, props.weightUnit)}</dd>
        <dt>MTOW</dt>
        <dd>{formatWeight(a.mtowKg, props.weightUnit)}</dd>
        <dt>MLW</dt>
        <dd>{formatWeight(a.mlwKg, props.weightUnit)}</dd>
        <dt>Max fuel</dt>
        <dd>{formatWeight(a.maxFuelKg, props.weightUnit)}</dd>
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

export function FleetView(props: { weightUnit: WeightUnit }): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [importSummary, setImportSummary] = useState<AircraftImportSummary | null>(null)

  function reload(): Promise<void> {
    return window.flightdeck.aircraftList().then(setAircraft)
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
        <AircraftForm
          weightUnit={props.weightUnit}
          onSubmit={handleCreate}
          onCancel={() => setView({ kind: 'list' })}
        />
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
          weightUnit={props.weightUnit}
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
        weightUnit={props.weightUnit}
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
    </div>
  )
}
