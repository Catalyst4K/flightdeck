import { useEffect, useState } from 'react'
import type { Aircraft, DispatchOfp, FleetStats, WeightUnit } from '@shared/ipc'
import { AirportSearch } from './AirportSearch'
import { formatWeight, mToFt } from './units'

function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')}Z`
}

function aircraftLabel(a: Aircraft): string {
  return `${a.registration} — ${a.icaoType}${a.operator ? ` (${a.operator})` : ''}`
}

export function DispatchView(props: {
  weightUnit: WeightUnit
  /** Called after a planned flight is saved, so the app can switch to Track to preview it. */
  onPlanned?: () => void
  /** Called whenever the fetched-but-not-yet-saved OFP changes, so Track can preview it too. */
  onOfpJsonChange?: (ofpJson: string | null) => void
}): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [fleetStats, setFleetStats] = useState<FleetStats[]>([])
  const [username, setUsername] = useState('')
  const [usernameSaved, setUsernameSaved] = useState(false)
  const [ofp, setOfp] = useState<DispatchOfp | null>(null)
  const [selectedAircraftId, setSelectedAircraftId] = useState<number | null>(null)
  const [planAircraftId, setPlanAircraftId] = useState<number | null>(null)
  const [depIcao, setDepIcao] = useState('')
  const [destIcao, setDestIcao] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dispatch never renders a map itself — Track is the only place a route/waypoints
  // preview shows up (both for a saved flight and, via this, a fetched-but-unsaved OFP).
  useEffect(() => {
    props.onOfpJsonChange?.(ofp?.ofpJson ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofp?.ofpJson])

  useEffect(() => {
    window.flightdeck.aircraftList().then(setAircraft)
    window.flightdeck.logbookFleetStats().then(setFleetStats)
    window.flightdeck.settingsGetSimbriefUsername().then((u) => setUsername(u ?? ''))
  }, [])

  async function handleSaveUsername(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    await window.flightdeck.settingsSetSimbriefUsername(username.trim())
    setUsernameSaved(true)
    setTimeout(() => setUsernameSaved(false), 2000)
  }

  function handlePlanAircraftChange(id: number | null): void {
    setPlanAircraftId(id)
    const selected = aircraft.find((a) => a.id === id)
    // Same fallback as the Fleet detail page's "Current airport": stored currentIcao
    // first, then the last completed flight's arrival airport — most of an imported
    // fleet has no currentIcao set (CSV import deliberately doesn't backfill it) but
    // does have real flight history to derive a location from.
    const lastArrIcao = fleetStats.find((s) => s.aircraftId === id)?.lastArrIcao
    setDepIcao(selected?.currentIcao ?? lastArrIcao ?? '')
    if (id != null) setSelectedAircraftId(id)
  }

  async function handleOpenSimBrief(): Promise<void> {
    const selected = aircraft.find((a) => a.id === planAircraftId)
    if (!selected || !depIcao || !destIcao) return
    await window.flightdeck.dispatchOpenSimBrief({
      origIcao: depIcao,
      destIcao,
      icaoType: selected.icaoType,
      simbriefAirframeId: selected.simbriefAirframeId
    })
  }

  async function handleFetch(): Promise<void> {
    setFetching(true)
    setError(null)
    setOfp(null)
    try {
      const fetched = await window.flightdeck.dispatchFetchOfp()
      setOfp(fetched)
      // A flight already chosen in the "Plan a flight" panel above takes priority over the
      // registration-match heuristic — that heuristic stays as a fallback for anyone who
      // fetches without going through that panel first.
      setSelectedAircraftId(selectedAircraftId ?? fetched.matchedAircraftId)
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
      setPlanAircraftId(null)
      setDepIcao('')
      setDestIcao('')
      props.onPlanned?.()
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

      <section style={{ border: '1px solid #ccc', padding: '1rem', margin: '1rem 0', maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Plan a flight</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Aircraft
            <select
              value={planAircraftId ?? ''}
              onChange={(e) => handlePlanAircraftChange(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— select —</option>
              {aircraft.map((a) => (
                <option key={a.id} value={a.id}>
                  {aircraftLabel(a)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Departure
            <AirportSearch value={depIcao} onChange={setDepIcao} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
            Destination
            <AirportSearch value={destIcao} onChange={setDestIcao} />
          </label>
          <button
            type="button"
            onClick={handleOpenSimBrief}
            disabled={planAircraftId == null || !depIcao || !destIcao}
          >
            Plan on SimBrief…
          </button>
        </div>
      </section>

      <section style={{ border: '1px solid #ccc', padding: '1rem', margin: '1rem 0', maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Or import an existing plan</h2>
        <p style={{ fontSize: '0.85rem', marginTop: 0 }}>
          Pulls your latest OFP from SimBrief — useful if you planned it there directly, or
          want to re-fetch after adjusting it on SimBrief's site.
        </p>
        <button type="button" onClick={handleFetch} disabled={fetching}>
          {fetching ? 'Fetching…' : 'Fetch latest OFP'}
        </button>
      </section>

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
            <dd>{formatWeight(ofp.fuelPlannedKg, props.weightUnit)}</dd>
            <dt>Pax / cargo</dt>
            <dd>
              {ofp.pax} / {formatWeight(ofp.cargoKg, props.weightUnit)}
            </dd>
            <dt>ZFW / TOW / LDW</dt>
            <dd>
              {formatWeight(ofp.zfwKg, props.weightUnit)} / {formatWeight(ofp.towKg, props.weightUnit)} /{' '}
              {formatWeight(ofp.ldwKg, props.weightUnit)}
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
          {ofp.matchedAircraftId == null && selectedAircraftId == null && (
            <p>
              No fleet aircraft matches tail {ofp.aircraftRegistration || '(none in OFP)'} — pick one
              manually.
            </p>
          )}

          <div style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={handleSaveFlight} disabled={saving || selectedAircraftId == null}>
              {saving ? 'Starting…' : 'Fly'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
