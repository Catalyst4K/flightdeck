import { useEffect, useState } from 'react'
import { BookOpen, Plane, Radar, Route, Settings as SettingsIcon } from 'lucide-react'
import type { AppPage, SimConnectionStatus, SimTelemetry, WeightUnit } from '@shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { DispatchView } from './DispatchView'
import { FleetView } from './FleetView'
import { LogbookView } from './LogbookView'
import { SettingsView } from './SettingsView'
import { TrackView } from './TrackView'

const TABS: { page: AppPage; label: string; icon: typeof Plane }[] = [
  { page: 'fleet', label: 'Fleet', icon: Plane },
  { page: 'dispatch', label: 'Dispatch', icon: Route },
  { page: 'track', label: 'Track', icon: Radar },
  { page: 'logbook', label: 'Logbook', icon: BookOpen },
  { page: 'settings', label: 'Settings', icon: SettingsIcon }
]

function connectionStatusLabel(status: SimConnectionStatus): string {
  switch (status.state) {
    case 'connected':
      return `Connected (SimConnect ${status.simConnectVersion})`
    case 'connecting':
      return 'Connecting…'
    case 'disconnected':
      return 'Disconnected — retrying'
  }
}

function connectionStatusVariant(status: SimConnectionStatus): 'default' | 'secondary' | 'destructive' {
  switch (status.state) {
    case 'connected':
      return 'default'
    case 'connecting':
      return 'secondary'
    case 'disconnected':
      return 'destructive'
  }
}

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<AppPage>('fleet')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb')
  const [simStatus, setSimStatus] = useState<SimConnectionStatus>({ state: 'disconnected' })
  const [telemetry, setTelemetry] = useState<SimTelemetry | null>(null)
  // Lifted out of DispatchView so Track can preview a fetched-but-not-yet-saved OFP too.
  const [dispatchOfpJson, setDispatchOfpJson] = useState<string | null>(null)

  useEffect(() => {
    window.flightdeck.settingsGetWeightUnit().then(setWeightUnit)
  }, [])

  useEffect(() => {
    // Pull current status in case the initial connect (main process starts it immediately
    // on app launch) already resolved before this component mounted — the push channel
    // below only delivers *future* changes, Electron doesn't replay missed IPC sends.
    window.flightdeck.getSimConnectionStatus().then(setSimStatus)
    const unsubscribeStatus = window.flightdeck.onSimConnectionStatus(setSimStatus)
    const unsubscribeTelemetry = window.flightdeck.onSimTelemetry(setTelemetry)
    return () => {
      unsubscribeStatus()
      unsubscribeTelemetry()
    }
  }, [])

  async function handleWeightUnitChange(unit: WeightUnit): Promise<void> {
    setWeightUnit(unit)
    await window.flightdeck.settingsSetWeightUnit(unit)
  }

  return (
    <main className="flex h-screen flex-col">
      <Tabs value={page} onValueChange={(value) => setPage(value as AppPage)} className="flex-1 gap-0">
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
          <TabsList variant="line">
            {TABS.map(({ page: tabPage, label, icon: Icon }) => (
              <TabsTrigger key={tabPage} value={tabPage} className="gap-1.5 px-3">
                <Icon />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Badge variant={connectionStatusVariant(simStatus)} title={connectionStatusLabel(simStatus)}>
            SimConnect: {simStatus.state}
          </Badge>
        </header>

        <div className="flex-1 overflow-auto p-8">
          {page === 'fleet' && <FleetView />}
          {page === 'dispatch' && (
            <DispatchView
              weightUnit={weightUnit}
              onPlanned={() => setPage('track')}
              onOfpJsonChange={setDispatchOfpJson}
            />
          )}
          {page === 'track' && <TrackView previewOfpJson={dispatchOfpJson} telemetry={telemetry} />}
          {page === 'logbook' && <LogbookView weightUnit={weightUnit} />}
          {page === 'settings' && (
            <SettingsView weightUnit={weightUnit} onWeightUnitChange={handleWeightUnitChange} />
          )}
        </div>
      </Tabs>
      <Toaster />
    </main>
  )
}
