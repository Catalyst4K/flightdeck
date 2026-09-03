import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { AircraftImportSummary, AltitudeUnit, GsxSettings, LogbookImportSummary, WeightUnit } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function summarizeAircraftImport(summary: AircraftImportSummary): string {
  if (summary.skipped.length === 0) return `Imported ${summary.imported} aircraft.`
  const skipped = summary.skipped.map((s) => `${s.registration} (${s.reason})`).join(', ')
  return `Imported ${summary.imported} aircraft. Skipped ${summary.skipped.length}: ${skipped}`
}

function summarizeLogbookImport(summary: LogbookImportSummary): string {
  const flightsLabel = `${summary.imported} flight${summary.imported === 1 ? '' : 's'}`
  const aircraftLabel =
    summary.aircraftCreated > 0 ? ` (added ${summary.aircraftCreated} aircraft to your fleet)` : ''
  const skippedLabel =
    summary.skipped.length > 0
      ? ` Skipped ${summary.skipped.length}: ${summary.skipped.map((s) => `${s.label} (${s.reason})`).join(', ')}`
      : ''
  return `Imported ${flightsLabel}${aircraftLabel}.${skippedLabel}`
}

export function SettingsView(props: {
  weightUnit: WeightUnit
  onWeightUnitChange: (unit: WeightUnit) => void
  altitudeUnit: AltitudeUnit
  onAltitudeUnitChange: (unit: AltitudeUnit) => void
}): React.JSX.Element {
  const [simbriefUsername, setSimbriefUsername] = useState('')
  const [importingAircraft, setImportingAircraft] = useState(false)
  const [importingLogbook, setImportingLogbook] = useState(false)
  const [gsx, setGsx] = useState<GsxSettings>({ enabled: false, folderPath: null })

  useEffect(() => {
    window.flightdeck.settingsGetSimbriefUsername().then((u) => setSimbriefUsername(u ?? ''))
    window.flightdeck.settingsGetGsx().then(setGsx)
  }, [])

  async function handleGsxToggle(enabled: boolean): Promise<void> {
    const next = { ...gsx, enabled }
    setGsx(next)
    await window.flightdeck.settingsSetGsx(next)
  }

  async function handleGsxBrowse(): Promise<void> {
    const folderPath = await window.flightdeck.gsxBrowseFolder()
    if (!folderPath) return
    const next = { ...gsx, folderPath }
    setGsx(next)
    await window.flightdeck.settingsSetGsx(next)
  }

  async function handleSaveSimbriefUsername(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    await window.flightdeck.settingsSetSimbriefUsername(simbriefUsername.trim())
    toast.success('SimBrief username saved.')
  }

  async function handleImportAircraft(): Promise<void> {
    setImportingAircraft(true)
    try {
      const summary = await window.flightdeck.aircraftImport()
      if (summary) toast.success(summarizeAircraftImport(summary))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingAircraft(false)
    }
  }

  async function handleExportAircraft(): Promise<void> {
    try {
      const saved = await window.flightdeck.aircraftExport()
      if (saved) toast.success('Fleet exported.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleImportLogbook(): Promise<void> {
    setImportingLogbook(true)
    try {
      const summary = await window.flightdeck.logbookImportCsv()
      if (summary) toast.success(summarizeLogbookImport(summary))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingLogbook(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-foreground">Settings</h1>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Weights:</span>
            <div className="flex gap-1.5">
              {(['kg', 'lb'] as const).map((unit) => (
                <Button
                  key={unit}
                  type="button"
                  size="sm"
                  variant={props.weightUnit === unit ? 'default' : 'outline'}
                  onClick={() => props.onWeightUnitChange(unit)}
                >
                  {unit}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">OFP altitudes:</span>
            <div className="flex gap-1.5">
              {(
                [
                  { unit: 'ft', label: 'Feet' },
                  { unit: 'm', label: 'Meters' },
                  { unit: 'hybrid', label: 'Hybrid' }
                ] as const
              ).map(({ unit, label }) => (
                <Button
                  key={unit}
                  type="button"
                  size="sm"
                  variant={props.altitudeUnit === unit ? 'default' : 'outline'}
                  onClick={() => props.onAltitudeUnitChange(unit)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            "Hybrid" shows each step climb in whichever unit it was actually planned in —
            feet for a standard level, meters for a route crossing into airspace (e.g.
            China) that assigns levels in meters — rather than converting everything to
            one unit.
          </p>
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>Used by Dispatch to fetch your latest OFP from SimBrief.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSimbriefUsername} className="flex items-end gap-2">
            <Label className="flex flex-1 flex-col items-start gap-1.5">
              SimBrief username
              <Input
                value={simbriefUsername}
                onChange={(e) => setSimbriefUsername(e.target.value)}
                placeholder="Navigraph Alias"
              />
            </Label>
            <Button type="submit" variant="outline" size="sm">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>Import or export your fleet and logbook as local files.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Fleet (JSON)</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleImportAircraft} disabled={importingAircraft}>
                {importingAircraft ? 'Importing…' : 'Import'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleExportAircraft}>
                Export
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Logbook (CSV)</span>
            <Button type="button" variant="outline" size="sm" onClick={handleImportLogbook} disabled={importingLogbook}>
              {importingLogbook ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>GSX ground services</CardTitle>
          <CardDescription>
            Attach GSX Pro's catering/fuel/handling receipts to matching flights in your Logbook. Windows only
            (GSX itself is Windows-only) — off by default, and nothing here shows up until enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Enabled</span>
            <Button
              type="button"
              size="sm"
              variant={gsx.enabled ? 'default' : 'outline'}
              onClick={() => handleGsxToggle(!gsx.enabled)}
            >
              {gsx.enabled ? 'On' : 'Off'}
            </Button>
          </div>
          <Label className="flex flex-col items-start gap-1.5">
            Receipts folder
            <div className="flex w-full gap-1.5">
              <Input type="text" readOnly value={gsx.folderPath ?? ''} placeholder="Not set" className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={handleGsxBrowse}>
                Browse…
              </Button>
            </div>
          </Label>
          <p className="text-xs text-muted-foreground">
            Usually %APPDATA%\Virtuali\GSX\Receipts. A path that's wrong or no longer exists just means no
            receipts are found — never an error.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
