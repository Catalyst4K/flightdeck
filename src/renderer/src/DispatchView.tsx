import { useEffect, useState } from 'react'
import type { Aircraft, DispatchOfp, Flight } from '@shared/ipc'
import { kgToLb, mToFt } from './units'

function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')}Z`
}

export function DispatchView(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [username, setUsername] = useState('')
  const [usernameSaved, setUsernameSaved] = useState(false)
  const [ofp, setOfp] = useState<DispatchOfp | null>(null)
  const [selectedAircraftId, setSelectedAircraftId] = useState<number | null>(null)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reloadFlights(): Promise<void> {
    return window.flightdeck.flightList().then(setFlights)
  }

  useEffect(() => {
    window.flightdeck.aircraftList().then(setAircraft)
    reloadFlights()
    window.flightdeck.settingsGetSimbriefUsername().then((u) => setUsername(u ?? ''))
  }, [])

  async function handleSaveUsername(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    await window.flightdeck.settingsSetSimbriefUsername(username.trim())
    setUsernameSaved(true)
    setTimeout(() => setUsernameSaved(false), 2000)
  }

  async function handleOpenSimBrief(): Promise<void> {
    const selected = aircraft.find((a) => a.id === selectedAircraftId)
    await window.flightdeck.dispatchOpenSimBrief(selected?.simbriefAirframeId ?? null)
  }

  async function handleFetch(): Promise<void> {
    setFetching(true)
    setError(null)
    setOfp(null)
    try {
      const fetched = await window.flightdeck.dispatchFetchOfp()
      setOfp(fetched)
      setSelectedAircraftId(fetched.matchedAircraftId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setFetching(false)
    }
  }

  async function handleSaveFlight(): Promise<void> {
    if (!ofp || selectedAircraftId == null) return
    setSaving(true)
    setError(null)
    try {
      await window.flightdeck.flightCreate({
        aircraftId: selectedAircraftId,
        flightNumber: ofp.flightNumber,
        depIcao: ofp.depIcao,
        arrIcao: ofp.arrIcao,
        altnIcao: ofp.altnIcao,
        routeString: ofp.routeString,
        cruiseAltM: ofp.cruiseAltM,
        schedOutUtc: ofp.schedOutUtc,
        schedInUtc: ofp.schedInUtc,
        fuelPlannedKg: ofp.fuelPlannedKg,
        pax: ofp.pax,
        cargoKg: ofp.cargoKg,
        zfwKg: ofp.zfwKg,
        towKg: ofp.towKg,
        ldwKg: ofp.ldwKg,
        ofpId: ofp.ofpId,
        ofpJson: ofp.ofpJson
      })
      setOfp(null)
      setSelectedAircraftId(null)
      await reloadFlights()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1>Dispatch</h1>

      <form onSubmit={handleSaveUsername} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label>
          SimBrief username{' '}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Navigraph Alias"
          />
        </label>
        <button type="submit">Save</button>
        {usernameSaved && <span>Saved</span>}
      </form>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        <button type="button" onClick={handleOpenSimBrief}>
          Plan on SimBrief…
        </button>
        <button type="button" onClick={handleFetch} disabled={fetching}>
          {fetching ? 'Fetching…' : 'Fetch latest OFP'}
        </button>
      </div>

      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {ofp && (
        <section style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1.5rem', maxWidth: 720 }}>
          <h2 style={{ marginTop: 0 }}>
            {ofp.flightNumber}: {ofp.depIcao} → {ofp.arrIcao} (altn {ofp.altnIcao})
          </h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1.5rem' }}>
            <dt>Aircraft (OFP)</dt>
            <dd>
              {ofp.aircraftIcaoType} {ofp.aircraftRegistration}
            </dd>
            <dt>Cruise altitude</dt>
            <dd>{Math.round(mToFt(ofp.cruiseAltM)).toLocaleString()} ft</dd>
            <dt>Scheduled out / in</dt>
            <dd>
              {formatUtc(ofp.schedOutUtc)} / {formatUtc(ofp.schedInUtc)}
            </dd>
            <dt>Planned fuel</dt>
            <dd>{Math.round(kgToLb(ofp.fuelPlannedKg)).toLocaleString()} lb</dd>
            <dt>Pax / cargo</dt>
            <dd>
              {ofp.pax} / {Math.round(kgToLb(ofp.cargoKg)).toLocaleString()} lb
            </dd>
            <dt>ZFW / TOW / LDW</dt>
            <dd>
              {Math.round(kgToLb(ofp.zfwKg)).toLocaleString()} /{' '}
              {Math.round(kgToLb(ofp.towKg)).toLocaleString()} /{' '}
              {Math.round(kgToLb(ofp.ldwKg)).toLocaleString()} lb
            </dd>
            <dt>Waypoints</dt>
            <dd>{ofp.waypoints.length}</dd>
          </dl>
          <p style={{ fontSize: '0.85rem', maxHeight: '4rem', overflow: 'auto' }}>{ofp.routeString}</p>

          <label>
            Fleet aircraft{' '}
            <select
              value={selectedAircraftId ?? ''}
              onChange={(e) => setSelectedAircraftId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— select —</option>
              {aircraft.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration} — {a.icaoType}
                  {a.registration === ofp.aircraftRegistration ? ' (matched)' : ''}
                </option>
              ))}
            </select>
          </label>
          {ofp.matchedAircraftId == null && (
            <p>
              No fleet aircraft matches tail {ofp.aircraftRegistration || '(none in OFP)'} — pick one
              manually.
            </p>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={handleSaveFlight} disabled={saving || selectedAircraftId == null}>
              {saving ? 'Saving…' : 'Save as planned flight'}
            </button>
          </div>
        </section>
      )}

      <h2>Planned flights</h2>
      {flights.length === 0 ? (
        <p>No flights yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th>Flight</th>
              <th>Route</th>
              <th>Aircraft</th>
              <th>Status</th>
              <th>Scheduled out</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{f.flightNumber ?? '—'}</td>
                <td>
                  {f.depIcao} → {f.arrIcao}
                </td>
                <td>{aircraft.find((a) => a.id === f.aircraftId)?.registration ?? f.aircraftId}</td>
                <td>{f.status}</td>
                <td>{f.schedOutUtc ? formatUtc(f.schedOutUtc) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
