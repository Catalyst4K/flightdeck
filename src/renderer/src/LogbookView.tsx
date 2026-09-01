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
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { Aircraft, Flight, LogbookImportSummary, TrackPoint, WeightUnit } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FlightMap } from './FlightMap'
import { parseRouteFromOfpJson, parseWaypointsFromOfpJson } from './route'
import { formatWeight, mToFt, msToKt } from './units'

type View = { kind: 'list' } | { kind: 'detail'; id: number }

// Recharts SVG props take any CSS color, including our design-token custom properties —
// this keeps the charts on the same palette as the rest of the app instead of hardcoded hex.
const CHART_GRID_COLOR = 'var(--color-border)'
const CHART_AXIS_COLOR = 'var(--color-muted-foreground)'
const CHART_SERIES_1 = 'var(--color-primary)'
const CHART_SERIES_2 = 'var(--color-success)'
const CHART_TOOLTIP_STYLE = {
  background: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-popover-foreground)',
  fontSize: '0.8rem'
}

function formatMinutes(min: number | null): string {
  if (min == null) return '—'
  const hours = Math.floor(min / 60)
  const minutes = Math.round(min % 60)
  return `${hours}h ${minutes}m`
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

function DetailField(props: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="text-foreground">{props.value}</dd>
    </>
  )
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
  const waypoints = useMemo(() => parseWaypointsFromOfpJson(flight.ofpJson), [flight.ofpJson])

  // Elapsed minutes since the first sample reads better on a chart than raw timestamps.
  const startMs = trackPoints.length ? new Date(trackPoints[0].tsUtc).getTime() : 0
  const profile = trackPoints.map((p) => ({
    tMin: Math.round(((new Date(p.tsUtc).getTime() - startMs) / 60000) * 10) / 10,
    altFt: Math.round(mToFt(p.altitudeM)),
    iasKt: Math.round(msToKt(p.indicatedAirspeedMs))
  }))

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
    <div className="flex flex-col gap-4">
      <Button type="button" variant="ghost" size="sm" onClick={props.onBack} className="w-fit">
        <ArrowLeft />
        Back to logbook
      </Button>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>
            {flight.flightNumber ?? `Flight #${flight.id}`} — {flight.depIcao} → {flight.arrIcao}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <DetailField label="Aircraft" value={aircraft?.registration ?? '—'} />
            <DetailField label="Date" value={formatDate(flight.actualOutUtc)} />
            <DetailField label="Block time" value={formatMinutes(flight.blockMinutes)} />
            <DetailField label="Air time" value={formatMinutes(flight.airMinutes)} />
            <DetailField label="Fuel burn" value={formatWeight(flight.fuelBurnKg, weightUnit)} />
            <DetailField label="Fuel planned" value={formatWeight(flight.fuelPlannedKg, weightUnit)} />
          </dl>
        </CardContent>
      </Card>

      <FlightMap live={false} route={route} waypoints={waypoints} trackPoints={trackPoints} />

      {profile.length > 1 && (
        <div className="flex flex-wrap gap-4">
          <Card className="w-[420px]">
            <CardHeader>
              <CardTitle className="text-sm">Altitude</CardTitle>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profile}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis dataKey="tMin" unit=" min" stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR }} />
                  <YAxis unit=" ft" width={70} stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR }} />
                  <Tooltip
                    formatter={(value) => `${value} ft`}
                    labelFormatter={(label) => `${label} min`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                  <Line type="monotone" dataKey="altFt" stroke={CHART_SERIES_1} dot={false} name="Altitude" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="w-[420px]">
            <CardHeader>
              <CardTitle className="text-sm">Speed (IAS)</CardTitle>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profile}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                  <XAxis dataKey="tMin" unit=" min" stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR }} />
                  <YAxis unit=" kt" width={60} stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR }} />
                  <Tooltip
                    formatter={(value) => `${value} kt`}
                    labelFormatter={(label) => `${label} min`}
                    contentStyle={CHART_TOOLTIP_STYLE}
                  />
                  <Line type="monotone" dataKey="iasKt" stroke={CHART_SERIES_2} dot={false} name="IAS" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {fuelData && (
        <Card className="w-[280px]">
          <CardHeader>
            <CardTitle className="text-sm">Fuel planned vs actual</CardTitle>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fuelData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                <XAxis dataKey="name" stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR }} />
                <YAxis width={60} stroke={CHART_AXIS_COLOR} tick={{ fill: CHART_AXIS_COLOR }} />
                <Tooltip
                  formatter={(value) => formatWeight(Number(value), weightUnit)}
                  contentStyle={CHART_TOOLTIP_STYLE}
                />
                <Bar dataKey="kg" fill={CHART_SERIES_1} name="Fuel" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function LogbookRowsSkeleton(): React.JSX.Element {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <TableRow key={i}>
          {[0, 1, 2, 3, 4, 5, 6].map((col) => (
            <TableCell key={col}>
              <Skeleton className="h-4 w-16" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function LogbookView(props: { weightUnit: WeightUnit }): React.JSX.Element {
  const [flights, setFlights] = useState<Flight[]>([])
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [aircraftFilter, setAircraftFilter] = useState<number | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  function reload(): Promise<void> {
    return Promise.all([
      window.flightdeck.logbookListCompletedFlights(),
      window.flightdeck.aircraftList()
    ]).then(([flightList, aircraftList]) => {
      setFlights(flightList)
      setAircraft(aircraftList)
    })
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  function summarizeImport(summary: LogbookImportSummary): string {
    const flightsLabel = `${summary.imported} flight${summary.imported === 1 ? '' : 's'}`
    const aircraftLabel =
      summary.aircraftCreated > 0 ? ` (added ${summary.aircraftCreated} aircraft to your fleet)` : ''
    const skippedLabel =
      summary.skipped.length > 0
        ? ` Skipped ${summary.skipped.length}: ${summary.skipped.map((s) => `${s.label} (${s.reason})`).join(', ')}`
        : ''
    return `Imported ${flightsLabel}${aircraftLabel}.${skippedLabel}`
  }

  async function handleImport(): Promise<void> {
    setImporting(true)
    try {
      const summary = await window.flightdeck.logbookImportCsv()
      if (summary) {
        toast.success(summarizeImport(summary))
        await reload()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  function registrationFor(aircraftId: number): string {
    return aircraft.find((a) => a.id === aircraftId)?.registration ?? `#${aircraftId}`
  }

  if (view.kind === 'detail') {
    const flight = flights.find((f) => f.id === view.id)
    if (!flight) return <p className="text-sm text-muted-foreground">Flight not found.</p>
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-foreground">Logbook</h1>
        <Button type="button" variant="outline" size="sm" onClick={handleImport} disabled={importing}>
          {importing ? 'Importing…' : 'Import CSV'}
        </Button>
      </div>

      {loading ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Flight</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Aircraft</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Air</TableHead>
              <TableHead>Fuel burn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <LogbookRowsSkeleton />
          </TableBody>
        </Table>
      ) : flights.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed flights yet — track one to see it here.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Select
              value={aircraftFilter === 'all' ? 'all' : String(aircraftFilter)}
              onValueChange={(v) => setAircraftFilter(v === 'all' ? 'all' : Number(v))}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All aircraft</SelectItem>
                {aircraft.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.registration}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Aircraft</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Air</TableHead>
                <TableHead>Fuel burn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFlights.map((f) => (
                <TableRow key={f.id} onClick={() => setView({ kind: 'detail', id: f.id })} className="cursor-pointer">
                  <TableCell>{formatDate(f.actualOutUtc)}</TableCell>
                  <TableCell>{f.flightNumber ?? '—'}</TableCell>
                  <TableCell>
                    {f.depIcao} → {f.arrIcao}
                  </TableCell>
                  <TableCell>{registrationFor(f.aircraftId)}</TableCell>
                  <TableCell>{formatMinutes(f.blockMinutes)}</TableCell>
                  <TableCell>{formatMinutes(f.airMinutes)}</TableCell>
                  <TableCell>{formatWeight(f.fuelBurnKg, props.weightUnit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
