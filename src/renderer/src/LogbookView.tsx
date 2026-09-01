import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { Aircraft, Flight, FleetStats, TrackPoint, WeightUnit } from '@shared/ipc'
import { FlightMap } from './FlightMap'
import { parseRouteFromOfpJson } from './route'
import { formatWeight, mToFt, msToKt } from './units'

type View = { kind: 'list' } | { kind: 'detail'; id: number }

function formatMinutes(min: number | null): string {
  if (min == null) return '—'
  const hours = Math.floor(min / 60)
  const minutes = Math.round(min % 60)
  return `${hours}h ${minutes}m`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function FlightDetail(props: {
  flight: Flight
  aircraft: Aircraft | undefined
  weightUnit: WeightUnit
  onBack: () => void
}): React.JSX.Element {
  const { flight, aircraft, weightUnit } = props
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([])

  useEffect(() => {
    window.flightdeck.trackPointList(flight.id).then(setTrackPoints)
  }, [flight.id])

  const route = useMemo(() => parseRouteFromOfpJson(flight.ofpJson), [flight.ofpJson])

  // Elapsed minutes since the first sample reads better on a chart than raw timestamps.
  const startMs = trackPoints.length ? new Date(trackPoints[0].tsUtc).getTime() : 0
  const profile = trackPoints.map((p) => ({
    tMin: Math.round(((new Date(p.tsUtc).getTime() - startMs) / 60000) * 10) / 10,
    altFt: Math.round(mToFt(p.altitudeM)),
    iasKt: Math.round(msToKt(p.indicatedAirspeedMs))
  }))

  const timeData = [
    { name: 'Block', minutes: flight.blockMinutes ?? 0 },
    { name: 'Air', minutes: flight.airMinutes ?? 0 }
  ]
  // Only meaningful for flights dispatched with a planned fuel figure (SimBrief OFP) —
  // ad-hoc flights created directly from the Track view have no fuelPlannedKg.
  const fuelData =
    flight.fuelPlannedKg != null
      ? [
          { name: 'Planned', kg: flight.fuelPlannedKg },
          { name: 'Actual', kg: flight.fuelBurnKg ?? 0 }
        ]
      : null

  return (
    <div>
      <button type="button" onClick={props.onBack}>
        ← Back to logbook
      </button>
      <h2>
        {flight.flightNumber ?? `Flight #${flight.id}`} — {flight.depIcao} → {flight.arrIcao}
      </h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1.5rem' }}>
        <dt>Aircraft</dt>
        <dd>{aircraft?.registration ?? '—'}</dd>
        <dt>Date</dt>
        <dd>{formatDate(flight.actualOutUtc)}</dd>
        <dt>Block time</dt>
        <dd>{formatMinutes(flight.blockMinutes)}</dd>
        <dt>Air time</dt>
        <dd>{formatMinutes(flight.airMinutes)}</dd>
        <dt>Fuel burn</dt>
        <dd>{formatWeight(flight.fuelBurnKg, weightUnit)}</dd>
        <dt>Fuel planned</dt>
        <dd>{formatWeight(flight.fuelPlannedKg, weightUnit)}</dd>
      </dl>

      <FlightMap live={false} route={route} trackPoints={trackPoints} />

      {profile.length > 1 && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ width: 420, height: 220 }}>
            <h3>Altitude</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profile}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tMin" unit=" min" />
                <YAxis unit=" ft" width={70} />
                <Tooltip formatter={(value) => `${value} ft`} labelFormatter={(label) => `${label} min`} />
                <Line type="monotone" dataKey="altFt" stroke="#1a73e8" dot={false} name="Altitude" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ width: 420, height: 220 }}>
            <h3>Speed (IAS)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={profile}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tMin" unit=" min" />
                <YAxis unit=" kt" width={60} />
                <Tooltip formatter={(value) => `${value} kt`} labelFormatter={(label) => `${label} min`} />
                <Line type="monotone" dataKey="iasKt" stroke="#d93025" dot={false} name="IAS" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <div style={{ width: 280, height: 200 }}>
          <h3>Block vs air time</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis unit="m" width={40} />
              <Tooltip formatter={(value) => `${value} min`} />
              <Bar dataKey="minutes" fill="#1a73e8" name="Minutes" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {fuelData && (
          <div style={{ width: 280, height: 200 }}>
            <h3>Fuel planned vs actual</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fuelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis width={60} />
                <Tooltip formatter={(value) => formatWeight(Number(value), weightUnit)} />
                <Bar dataKey="kg" fill="#1a73e8" name="Fuel" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

export function LogbookView(props: { weightUnit: WeightUnit }): React.JSX.Element {
  const [flights, setFlights] = useState<Flight[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [stats, setStats] = useState<FleetStats[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [aircraftFilter, setAircraftFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    Promise.all([
      window.flightdeck.logbookListCompletedFlights(),
      window.flightdeck.aircraftList(),
      window.flightdeck.logbookFleetStats()
    ]).then(([flightList, aircraftList, fleetStats]) => {
      setFlights(flightList)
      setAircraft(aircraftList)
      setStats(fleetStats)
    })
  }, [])

  function registrationFor(aircraftId: number): string {
    return aircraft.find((a) => a.id === aircraftId)?.registration ?? `#${aircraftId}`
  }

  if (view.kind === 'detail') {
    const flight = flights.find((f) => f.id === view.id)
    if (!flight) return <p>Flight not found.</p>
    return (
      <FlightDetail
        flight={flight}
        aircraft={aircraft.find((a) => a.id === flight.aircraftId)}
        weightUnit={props.weightUnit}
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }

  const filteredFlights =
    aircraftFilter === 'all' ? flights : flights.filter((f) => f.aircraftId === aircraftFilter)

  return (
    <div>
      <h1>Logbook</h1>

      {stats.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '1.5rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th>Registration</th>
              <th>Hours</th>
              <th>Cycles</th>
              <th>Last location</th>
              <th>Last flight</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.aircraftId} style={{ borderBottom: '1px solid #eee' }}>
                <td>{s.registration}</td>
                <td>{s.totalHours.toFixed(1)}</td>
                <td>{s.totalCycles}</td>
                <td>{s.lastArrIcao}</td>
                <td>{formatDate(s.lastFlightInUtc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {flights.length === 0 ? (
        <p>No completed flights yet — track one to see it here.</p>
      ) : (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <label>
              Aircraft:{' '}
              <select
                value={aircraftFilter}
                onChange={(e) => setAircraftFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All aircraft</option>
                {aircraft.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.registration}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                <th>Date</th>
                <th>Flight</th>
                <th>Route</th>
                <th>Aircraft</th>
                <th>Block</th>
                <th>Air</th>
                <th>Fuel burn</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlights.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => setView({ kind: 'detail', id: f.id })}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                >
                  <td>{formatDate(f.actualOutUtc)}</td>
                  <td>{f.flightNumber ?? '—'}</td>
                  <td>
                    {f.depIcao} → {f.arrIcao}
                  </td>
                  <td>{registrationFor(f.aircraftId)}</td>
                  <td>{formatMinutes(f.blockMinutes)}</td>
                  <td>{formatMinutes(f.airMinutes)}</td>
                  <td>{formatWeight(f.fuelBurnKg, props.weightUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
