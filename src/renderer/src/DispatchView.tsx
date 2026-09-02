import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Aircraft, DispatchOfp, FleetStats, WeightUnit } from '@shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AirportSearch } from './AirportSearch'
import { MetarPanel } from './MetarPanel'
import { formatWeight, mToFt } from './units'

function formatUtc(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')}Z`
}

function aircraftLabel(a: Aircraft): string {
  return `${a.registration} — ${a.icaoType}${a.operator ? ` (${a.operator})` : ''}`
}

function DetailField(props: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="text-foreground">{props.value}</dd>
    </>
  )
}

export function DispatchView(props: {
  weightUnit: WeightUnit
  /** Called after a planned flight is saved, so the app can switch to Track to preview it. */
  onPlanned?: () => void
  /** The currently fetched/created OFP — lifted to App so it survives switching away to
   *  another tab and back, and so Track can preview it before it's saved as a flight. */
  ofp: DispatchOfp | null
  onOfpChange: (ofp: DispatchOfp | null) => void
  /** ofpId of the OFP that's already been turned into a flight, if any — also lifted, so
   *  "still planning this" vs. "already flying this, shown for reference" survives a
   *  tab switch the same way `ofp` does. */
  dispatchedOfpId: string | null
  onDispatchedOfpIdChange: (ofpId: string | null) => void
}): React.JSX.Element {
  const { ofp } = props
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [fleetStats, setFleetStats] = useState<FleetStats[]>([])
  const [selectedAircraftId, setSelectedAircraftId] = useState<number | null>(null)
  const [planAircraftId, setPlanAircraftId] = useState<number | null>(null)
  const [depIcao, setDepIcao] = useState('')
  const [destIcao, setDestIcao] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.flightdeck.aircraftList().then(setAircraft)
    window.flightdeck.logbookFleetStats().then(setFleetStats)
  }, [])

  function handlePlanAircraftChange(id: number): void {
    setPlanAircraftId(id)
    const selected = aircraft.find((a) => a.id === id)
    // Same fallback as the Fleet detail page's "Current airport": stored currentIcao
    // first, then the last completed flight's arrival airport — most of an imported
    // fleet has no currentIcao set (CSV import deliberately doesn't backfill it) but
    // does have real flight history to derive a location from.
    const lastArrIcao = fleetStats.find((s) => s.aircraftId === id)?.lastArrIcao
    setDepIcao(selected?.currentIcao ?? lastArrIcao ?? '')
    setSelectedAircraftId(id)
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
    props.onOfpChange(null)
    try {
      const fetched = await window.flightdeck.dispatchFetchOfp()
      props.onOfpChange(fetched)
      // A flight already chosen in the "Plan a flight" panel above takes priority over the
      // registration-match heuristic — that heuristic stays as a fallback for anyone who
      // fetches without going through that panel first.
      setSelectedAircraftId(selectedAircraftId ?? fetched.matchedAircraftId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setFetching(false)
    }
  }

  async function handleSaveFlight(): Promise<void> {
    if (!ofp || selectedAircraftId == null) return
    setSaving(true)
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
      // The OFP itself stays put — Dispatch doubles as a weights/info reference for
      // whatever's currently dispatched until it's overwritten by the next fetch (see
      // alreadyFlown below) or the app closes. Only the "start a new plan" side resets.
      props.onDispatchedOfpIdChange(ofp.ofpId)
      setSelectedAircraftId(null)
      setPlanAircraftId(null)
      setDepIcao('')
      setDestIcao('')
      props.onPlanned?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const metarAirports = ofp
    ? { depIcao: ofp.depIcao, arrIcao: ofp.arrIcao, altnIcao: ofp.altnIcao }
    : { depIcao: depIcao || null, arrIcao: destIcao || null, altnIcao: null }
  const alreadyFlown = ofp != null && ofp.ofpId === props.dispatchedOfpId

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-foreground">Dispatch</h1>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-72 max-w-md flex-1 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Plan a flight</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Aircraft</Label>
                <Select
                  value={planAircraftId != null ? String(planAircraftId) : undefined}
                  onValueChange={(v) => handlePlanAircraftChange(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— select —" />
                  </SelectTrigger>
                  <SelectContent>
                    {aircraft.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {aircraftLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Departure</Label>
                <AirportSearch value={depIcao} onChange={setDepIcao} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Destination</Label>
                <AirportSearch value={destIcao} onChange={setDestIcao} />
              </div>
              <Button
                type="button"
                onClick={handleOpenSimBrief}
                disabled={planAircraftId == null || !depIcao || !destIcao}
              >
                Plan on SimBrief…
              </Button>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Or import an existing plan</CardTitle>
              <CardDescription>
                Pulls your latest OFP from SimBrief — useful if you planned it there directly, or want
                to re-fetch after adjusting it on SimBrief's site.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" size="sm" onClick={handleFetch} disabled={fetching}>
                {fetching ? 'Fetching…' : 'Fetch latest OFP'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-72 flex-1 flex-col gap-4">
          <MetarPanel depIcao={metarAirports.depIcao} arrIcao={metarAirports.arrIcao} altnIcao={metarAirports.altnIcao} />

          {ofp ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {ofp.flightNumber}: {ofp.depIcao} → {ofp.arrIcao} (altn {ofp.altnIcao})
                </CardTitle>
                {alreadyFlown && (
                  <CardAction>
                    <Badge variant="secondary">Flying</Badge>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <DetailField
                    label="Aircraft (OFP)"
                    value={`${ofp.aircraftIcaoType} ${ofp.aircraftRegistration}`}
                  />
                  <DetailField
                    label="Cruise altitude"
                    value={`${Math.round(mToFt(ofp.cruiseAltM)).toLocaleString()} ft`}
                  />
                  <DetailField
                    label="Scheduled out / in"
                    value={`${formatUtc(ofp.schedOutUtc)} / ${formatUtc(ofp.schedInUtc)}`}
                  />
                  <DetailField label="Planned fuel" value={formatWeight(ofp.fuelPlannedKg, props.weightUnit)} />
                  <DetailField
                    label="Pax / cargo"
                    value={`${ofp.pax} / ${formatWeight(ofp.cargoKg, props.weightUnit)}`}
                  />
                  <DetailField
                    label="ZFW / TOW / LDW"
                    value={`${formatWeight(ofp.zfwKg, props.weightUnit)} / ${formatWeight(ofp.towKg, props.weightUnit)} / ${formatWeight(ofp.ldwKg, props.weightUnit)}`}
                  />
                </dl>
                <p className="max-h-16 overflow-auto text-sm text-muted-foreground">{ofp.routeString}</p>

                <div className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">Step climbs</span>
                  {ofp.stepClimbs.length === 0 ? (
                    <p className="text-sm text-foreground">None planned</p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {ofp.stepClimbs.map((climb) => (
                        <li key={climb.atIdent} className="font-mono text-sm text-foreground">
                          {climb.fromAltitudeFt.toLocaleString()} ft → {climb.toAltitudeFt.toLocaleString()} ft at{' '}
                          {climb.atIdent}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {!alreadyFlown && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label>Fleet aircraft</Label>
                      <Select
                        value={selectedAircraftId != null ? String(selectedAircraftId) : undefined}
                        onValueChange={(v) => setSelectedAircraftId(Number(v))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="— select —" />
                        </SelectTrigger>
                        <SelectContent>
                          {aircraft.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.registration} — {a.icaoType}
                              {a.registration === ofp.aircraftRegistration ? ' (matched)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {ofp.matchedAircraftId == null && selectedAircraftId == null && (
                      <p className="text-sm text-muted-foreground">
                        No fleet aircraft matches tail {ofp.aircraftRegistration || '(none in OFP)'} — pick
                        one manually.
                      </p>
                    )}

                    <Button type="button" onClick={handleSaveFlight} disabled={saving || selectedAircraftId == null}>
                      {saving ? 'Starting…' : 'Fly'}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Plan or fetch a flight to see its details here.</p>
          )}
        </div>
      </div>
    </div>
  )
}
