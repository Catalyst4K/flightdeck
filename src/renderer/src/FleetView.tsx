import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Aircraft, AircraftLanding, FleetStats, NewAircraft } from '@shared/ipc'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AircraftForm } from './AircraftForm'
import { AirlineLogo } from './AirlineLogo'
import { LandingBadge } from './LandingBadge'
import { classifyLanding } from './landing-severity'
import { useLandingThresholds } from './useLandingThresholds'
import { msToFpm, msToKt } from './units'

type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'new' } | { kind: 'edit'; id: number }

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function AirlineLabel(props: { operator: string | null; operatorIata: string | null }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <AirlineLogo iata={props.operatorIata} />
      {props.operator ?? '—'}
    </span>
  )
}

function DetailField(props: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="text-foreground">{props.value}</dd>
    </>
  )
}

/**
 * Three states, per docs/decisions.md's fleet-simbrief-airframe entry — this deliberately
 * doesn't reimplement SimBrief's own airframe editor, just makes the link between a fleet
 * aircraft and its SimBrief profile visible and one click to reach:
 * - a custom profile is set: open *that* airframe's editor directly.
 * - no custom profile, but a SimBrief default type is chosen: show it, offer to change it
 *   or create a custom one instead.
 * - nothing set at all: explain the (usually fine) fallback and offer to create a profile.
 */
function SimBriefProfileCard(props: { aircraft: Aircraft }): React.JSX.Element {
  const a = props.aircraft

  function openAirframes(): void {
    void window.flightdeck.dispatchOpenSimBriefAirframes(a.simbriefAirframeId)
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">SimBrief profile</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {a.simbriefAirframeId ? (
          <>
            <p className="text-foreground">
              Custom profile: <span className="font-mono">{a.simbriefAirframeId}</span>
            </p>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={openAirframes}>
              Open in SimBrief
            </Button>
          </>
        ) : a.simbriefType ? (
          <>
            <p className="text-foreground">
              Using SimBrief default: <span className="font-mono">{a.simbriefType}</span>
            </p>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={openAirframes}>
              Create a custom airframe in SimBrief
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              No profile set — plans fall back to SimBrief's own default for {a.icaoType}, which is usually
              fine and occasionally very wrong on weights (and therefore fuel).
            </p>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={openAirframes}>
              Create a custom airframe in SimBrief
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Fleet's per-aircraft landing history, per docs/decisions.md's landing-analysis entry —
 *  not per-flight (Logbook's job), but how this specific tail has actually been landed
 *  over its life in the fleet. Empty state is the common case for a while: only flights
 *  tracked since this feature shipped have a landing record at all. */
function LandingHistoryCard(props: { aircraftId: number }): React.JSX.Element {
  const [landings, setLandings] = useState<AircraftLanding[]>([])
  const thresholds = useLandingThresholds()

  useEffect(() => {
    window.flightdeck.fleetListLandings(props.aircraftId).then(setLandings)
  }, [props.aircraftId])

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">Landing history</CardTitle>
      </CardHeader>
      <CardContent>
        {landings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No landings recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            {landings.map((l) => {
              const fpm = Math.round(msToFpm(l.verticalSpeedMs))
              const severity = classifyLanding(l.verticalSpeedMs, thresholds)
              return (
                <div key={l.id} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{new Date(l.touchdownTsUtc).toLocaleDateString()}</span>
                  <span className="font-mono tabular-nums text-foreground">{fpm} fpm</span>
                  <span className="text-foreground">{l.runwayIdent ?? '—'}</span>
                  <span className="text-muted-foreground">
                    {l.crosswindMs != null ? `${Math.round(msToKt(Math.abs(l.crosswindMs)))} kt xwind` : '—'}
                  </span>
                  <LandingBadge severity={severity} />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
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
    <div className="flex max-w-lg flex-col gap-4">
      <Button type="button" variant="ghost" size="sm" onClick={props.onBack} className="w-fit">
        <ArrowLeft />
        Back to fleet
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {a.registration} — {a.icaoType}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <DetailField label="Airline" value={<AirlineLabel operator={a.operator} operatorIata={a.operatorIata} />} />
            <DetailField label="Current airport" value={a.currentIcao ?? s?.lastArrIcao ?? '—'} />
            <DetailField label="Total hours" value={s ? s.totalHours.toFixed(1) : '0.0'} />
            <DetailField label="Flights" value={s?.totalCycles ?? 0} />
            <DetailField label="Last flight" value={formatDate(s?.lastFlightInUtc ?? null)} />
          </dl>
          <SimBriefProfileCard aircraft={a} />
          <LandingHistoryCard aircraftId={a.id} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={props.onEdit}>
              <Pencil />
              Edit
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={props.onDelete}>
              <Trash2 />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function FleetView(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [stats, setStats] = useState<FleetStats[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [deleteTarget, setDeleteTarget] = useState<Aircraft | null>(null)

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

  async function handleConfirmDelete(): Promise<void> {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await window.flightdeck.aircraftDelete(target.id)
      await reload()
      setView({ kind: 'list' })
      toast.success(`Deleted ${target.registration}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (view.kind === 'new') {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">New aircraft</h1>
        <AircraftForm onSubmit={handleCreate} onCancel={() => setView({ kind: 'list' })} />
      </div>
    )
  }

  if (view.kind === 'edit') {
    const existing = aircraft.find((a) => a.id === view.id)
    if (!existing) return <p className="text-sm text-muted-foreground">Aircraft not found.</p>
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Edit {existing.registration}</h1>
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
    if (!existing) return <p className="text-sm text-muted-foreground">Aircraft not found.</p>
    return (
      <>
        <AircraftDetail
          aircraft={existing}
          stats={stats.find((s) => s.aircraftId === existing.id)}
          onEdit={() => setView({ kind: 'edit', id: view.id })}
          onDelete={() => setDeleteTarget(existing)}
          onBack={() => setView({ kind: 'list' })}
        />
        <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteTarget?.registration}?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Fleet</h1>
        <Button type="button" size="sm" onClick={() => setView({ kind: 'new' })}>
          <Plus />
          New aircraft
        </Button>
      </div>

      {aircraft.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No aircraft yet — add one, or import a fleet from Settings → Data.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Registration</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Airline</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead>Flights</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aircraft.map((a) => {
              const s = stats.find((stat) => stat.aircraftId === a.id)
              return (
                <TableRow
                  key={a.id}
                  onClick={() => setView({ kind: 'detail', id: a.id })}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{a.registration}</TableCell>
                  <TableCell>{a.icaoType}</TableCell>
                  <TableCell>
                    <AirlineLabel operator={a.operator} operatorIata={a.operatorIata} />
                  </TableCell>
                  <TableCell>{s ? s.totalHours.toFixed(1) : '0.0'}</TableCell>
                  <TableCell>{s?.totalCycles ?? 0}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
