import { useEffect, useMemo, useState } from 'react'
import type { ActiveTracking, Aircraft, Flight, SimTelemetry, TrackPoint } from '@shared/ipc'
import { FlightMap } from './FlightMap'
import { parseRouteFromOfpJson, parseWaypointsFromOfpJson } from './route'

export function TrackView(props: {
  /** The OFP most recently fetched in Dispatch, not yet saved as a flight — last-resort
   *  preview so a route shows up here even before "Save as planned flight" is clicked. */
  previewOfpJson?: string | null
  /** Live sim telemetry, shown as a small overlay on the map. */
  telemetry?: SimTelemetry | null
}): React.JSX.Element {
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

  /** Cancels the actively tracked flight — abandoned rather than completed. */
  async function handleCancelActive(): Promise<void> {
    await window.flightdeck.trackingStop()
    setActive(null)
    await reload()
  }

  /** Manually ends and saves the actively tracked flight now, rather than waiting for
   *  automatic shutdown detection. */
  async function handleFinish(): Promise<void> {
    await window.flightdeck.trackingFinish()
    setActive(null)
    await reload()
  }

  /** Cancels a flight that's been planned but never started tracking. */
  async function handleCancelPlanned(id: number): Promise<void> {
    await window.flightdeck.flightCancel(id)
    await reload()
  }

  const plannedFlights = flights.filter((f) => f.status === 'planned')
  const activeFlight = active ? flights.find((f) => f.id === active.flightId) : undefined
  // Before tracking starts, preview the most recently planned flight (flightList already
  // orders newest-first) so a freshly-dispatched plan shows up on the map immediately
  // rather than only after "Start tracking" is clicked. If nothing's been saved yet,
  // fall back to whatever OFP Dispatch most recently fetched — so the route shows up
  // here even before "Save as planned flight".
  const previewFlight = activeFlight ?? plannedFlights[0]
  // Two separate memos (rather than one combined one) so each keeps the same single,
  // already-stable dependency shape — a flight object and a prop string don't compose
  // well as one dependency array for React Compiler's manual-memoization check. Falls
  // back to whatever OFP Dispatch most recently fetched (not yet saved as a flight) if
  // there's no saved/active flight to preview yet.
  const flightRoute = useMemo(
    () => (previewFlight ? parseRouteFromOfpJson(previewFlight.ofpJson) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewFlight?.ofpJson]
  )
  const flightWaypoints = useMemo(
    () => (previewFlight ? parseWaypointsFromOfpJson(previewFlight.ofpJson) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewFlight?.ofpJson]
  )
  const dispatchPreviewRoute = useMemo(
    () => parseRouteFromOfpJson(props.previewOfpJson ?? null),
    [props.previewOfpJson]
  )
  const dispatchPreviewWaypoints = useMemo(
    () => parseWaypointsFromOfpJson(props.previewOfpJson ?? null),
    [props.previewOfpJson]
  )
  const route = previewFlight ? flightRoute : dispatchPreviewRoute
  const waypoints = previewFlight ? flightWaypoints : dispatchPreviewWaypoints

  return (
    <div>
      <h1>Track</h1>

      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      {active ? (
        <p>
          Tracking {activeFlight?.flightNumber ?? `flight #${active.flightId}`} — phase:{' '}
          <strong>{active.phase}</strong>{' '}
          <button type="button" onClick={handleCancelActive}>
            Cancel flight
          </button>{' '}
          <button type="button" onClick={handleFinish}>
            Finish & save
          </button>
        </p>
      ) : plannedFlights.length === 0 ? (
        <p>
          {props.previewOfpJson
            ? 'Previewing the OFP fetched in Dispatch — save it as a planned flight to start tracking.'
            : 'No planned flights to track — dispatch one first.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {plannedFlights.map((f) => (
            <div key={f.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>
                {f.flightNumber ?? `${f.depIcao} → ${f.arrIcao}`} (
                {aircraft.find((a) => a.id === f.aircraftId)?.registration ?? f.aircraftId})
              </span>
              <button type="button" disabled={starting} onClick={() => handleStart(f.id)}>
                Start tracking
              </button>
              <button type="button" onClick={() => handleCancelPlanned(f.id)}>
                Cancel flight
              </button>
            </div>
          ))}
        </div>
      )}

      <FlightMap
        live
        route={route}
        waypoints={waypoints}
        trackPoints={trackPoints}
        telemetry={props.telemetry}
      />
    </div>
  )
}
