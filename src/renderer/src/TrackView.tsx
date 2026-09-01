import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ActiveTracking, Aircraft, Flight, SimTelemetry, TrackPoint } from '@shared/ipc'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FlightMap } from './FlightMap'
import { MetarPanel } from './MetarPanel'
import { parseAirportsFromOfpJson, parseRouteFromOfpJson, parseWaypointsFromOfpJson } from './route'

type ConfirmAction =
  | { kind: 'cancel-active'; title: string; description: string }
  | { kind: 'finish'; title: string; description: string }
  | { kind: 'cancel-planned'; id: number; title: string; description: string }

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
  const [starting, setStarting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

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
    try {
      await window.flightdeck.trackingStart(flightId)
      setActive(await window.flightdeck.trackingGetActive())
      setTrackPoints([])
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    try {
      if (action.kind === 'cancel-active') {
        await window.flightdeck.trackingStop()
        setActive(null)
        await reload()
      } else if (action.kind === 'finish') {
        await window.flightdeck.trackingFinish()
        setActive(null)
        await reload()
      } else {
        await window.flightdeck.flightCancel(action.id)
        await reload()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const plannedFlights = flights.filter((f) => f.status === 'planned')
  const activeFlight = active ? flights.find((f) => f.id === active.flightId) : undefined
  const activeLabel = activeFlight?.flightNumber ?? `flight #${active?.flightId}`
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
  // A saved/active flight already has these as plain fields; a Dispatch preview (not yet
  // saved) only has the raw OFP JSON, same fallback as route/waypoints above.
  const airports = previewFlight
    ? { depIcao: previewFlight.depIcao, arrIcao: previewFlight.arrIcao, altnIcao: previewFlight.altnIcao }
    : parseAirportsFromOfpJson(props.previewOfpJson ?? null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Track</h1>
        <MetarPanel depIcao={airports.depIcao} arrIcao={airports.arrIcao} altnIcao={airports.altnIcao} />
      </div>

      {active ? (
        <Card>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">
              Tracking <span className="font-medium">{activeLabel}</span> — phase:{' '}
              <span className="font-mono">{active.phase}</span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() =>
                  setConfirmAction({
                    kind: 'cancel-active',
                    title: `Cancel ${activeLabel}?`,
                    description: 'The flight will be marked abandoned rather than completed.'
                  })
                }
              >
                Cancel flight
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setConfirmAction({
                    kind: 'finish',
                    title: `Finish ${activeLabel} now?`,
                    description: 'Ends tracking immediately and saves the flight as completed.'
                  })
                }
              >
                Finish & save
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : plannedFlights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {props.previewOfpJson
            ? 'Previewing the OFP fetched in Dispatch — save it as a planned flight to start tracking.'
            : 'No planned flights to track — dispatch one first.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {plannedFlights.map((f) => {
            const label = f.flightNumber ?? `${f.depIcao} → ${f.arrIcao}`
            const registration = aircraft.find((a) => a.id === f.aircraftId)?.registration ?? f.aircraftId
            return (
              <Card key={f.id}>
                <CardContent className="flex items-center justify-between gap-4">
                  <span className="text-sm text-foreground">
                    {label} ({registration})
                  </span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={starting} onClick={() => handleStart(f.id)}>
                      Start tracking
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        setConfirmAction({
                          kind: 'cancel-planned',
                          id: f.id,
                          title: `Cancel ${label}?`,
                          description: 'This planned flight will be abandoned.'
                        })
                      }
                    >
                      Cancel flight
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <FlightMap live route={route} waypoints={waypoints} trackPoints={trackPoints} telemetry={props.telemetry} />

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmAction?.kind === 'finish' ? 'default' : 'destructive'}
              onClick={handleConfirm}
            >
              {confirmAction?.kind === 'finish' ? 'Finish & save' : 'Cancel flight'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
