import { useEffect, useMemo, useState } from 'react'
import type { ActiveTracking, Aircraft, Flight, TrackPoint } from '@shared/ipc'
import { FlightMap } from './FlightMap'
import { parseRouteFromOfpJson, parseWaypointsFromOfpJson } from './route'

export function TrackView(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [active, setActive] = useState<ActiveTracking | null>(null)
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  function reload(): Promise<void> {
    return Promise.all([window.flightdeck.aircraftList(), window.flightdeck.flightList()]).then(
      ([aircraftList, flightList]) => {
        setAircraft(aircraftList)
        setFlights(flightList)
      }
    )
  }

  useEffect(() => {
    reload()
    window.flightdeck.trackingGetActive().then((a) => {
      setActive(a)
      if (a) window.flightdeck.trackPointList(a.flightId).then(setTrackPoints)
    })
    const unsubscribe = window.flightdeck.onTrackingPoint((point) => {
      setActive({ flightId: point.flightId, phase: point.phase })
      setTrackPoints((current) =>
        current.length && current[0].flightId !== point.flightId ? [point] : [...current, point]
      )
      if (point.phase === 'shutdown') reload()
    })
    return unsubscribe
  }, [])

  async function handleStart(flightId: number): Promise<void> {
    setStarting(true)
    setError(null)
    try {
      await window.flightdeck.trackingStart(flightId)
      setActive(await window.flightdeck.trackingGetActive())
      setTrackPoints([])
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleStop(): Promise<void> {
    await window.flightdeck.trackingStop()
    setActive(null)
    await reload()
  }

  const plannedFlights = flights.filter((f) => f.status === 'planned')
  const activeFlight = active ? flights.find((f) => f.id === active.flightId) : undefined
  // Before tracking starts, preview the most recently planned flight (flightList already
  // orders newest-first) so a freshly-dispatched plan shows up on the map immediately
  // rather than only after "Start tracking" is clicked.
  const previewFlight = activeFlight ?? plannedFlights[0]
  // Falls back to nothing if the preview flight has no stored OFP. Keyed on ofpJson rather
  // than the whole flight object so a `flights` reload with unchanged OFP data doesn't
  // hand FlightMap a new array reference and re-trigger its route-drawing effect.
  const route = useMemo(
    () => (previewFlight ? parseRouteFromOfpJson(previewFlight.ofpJson) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewFlight?.ofpJson]
  )
  const waypoints = useMemo(
    () => (previewFlight ? parseWaypointsFromOfpJson(previewFlight.ofpJson) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewFlight?.ofpJson]
  )

  return (
    <div>
      <h1>Track</h1>

      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {active ? (
        <p>
          Tracking {activeFlight?.flightNumber ?? `flight #${active.flightId}`} — phase:{' '}
          <strong>{active.phase}</strong>{' '}
          <button type="button" onClick={handleStop}>
            Stop tracking
          </button>
        </p>
      ) : plannedFlights.length === 0 ? (
        <p>No planned flights to track — dispatch one first.</p>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <span>Track:</span>
          {plannedFlights.map((f) => (
            <button key={f.id} type="button" disabled={starting} onClick={() => handleStart(f.id)}>
              {f.flightNumber ?? `${f.depIcao} → ${f.arrIcao}`} (
              {aircraft.find((a) => a.id === f.aircraftId)?.registration ?? f.aircraftId})
            </button>
          ))}
        </div>
      )}

      <FlightMap live route={route} waypoints={waypoints} trackPoints={trackPoints} />
    </div>
  )
}
