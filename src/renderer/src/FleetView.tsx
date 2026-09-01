import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { Aircraft, AircraftImportSummary, FleetStats, NewAircraft } from '@shared/ipc'
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

type View = { kind: 'list' } | { kind: 'detail'; id: number } | { kind: 'new' } | { kind: 'edit'; id: number }

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

// Free, keyless logo-by-IATA-code image service (docs/decisions.md, 2026-09-01 airline-
// search entry) — the same service Kiwi.com's own site uses. Not every IATA code has a
// logo there, so a failed load just hides the image rather than showing a broken icon.
function AirlineLogo(props: { iata: string | null }): React.JSX.Element | null {
  if (!props.iata) return null
  return (
    <img
      src={`https://images.kiwi.com/airlines/32/${props.iata}.png`}
      alt=""
      className="size-4 rounded-sm"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
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
            <DetailField label="SimBrief profile" value={a.simbriefAirframeId ?? '—'} />
            <DetailField label="Current airport" value={a.currentIcao ?? s?.lastArrIcao ?? '—'} />
            <DetailField label="Total hours" value={s ? s.totalHours.toFixed(1) : '0.0'} />
            <DetailField label="Flights" value={s?.totalCycles ?? 0} />
            <DetailField label="Last flight" value={formatDate(s?.lastFlightInUtc ?? null)} />
          </dl>
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

  function summarizeImport(summary: AircraftImportSummary): string {
    if (summary.skipped.length === 0) return `Imported ${summary.imported} aircraft.`
    const skipped = summary.skipped.map((s) => `${s.registration} (${s.reason})`).join(', ')
    return `Imported ${summary.imported} aircraft. Skipped ${summary.skipped.length}: ${skipped}`
  }

  async function handleImport(): Promise<void> {
    try {
      const summary = await window.flightdeck.aircraftImport()
      if (summary) {
        toast.success(summarizeImport(summary))
        await reload()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleExport(): Promise<void> {
    try {
      const saved = await window.flightdeck.aircraftExport()
      if (saved) toast.success('Fleet exported.')
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
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleImport}>
            <Upload />
            Import JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <Download />
            Export JSON
          </Button>
          <Button type="button" size="sm" onClick={() => setView({ kind: 'new' })}>
            <Plus />
            New aircraft
          </Button>
        </div>
      </div>

      {aircraft.length === 0 ? (
        <p className="text-sm text-muted-foreground">No aircraft yet — add one or import a fleet.</p>
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
