import { useEffect, useState } from 'react'
import type { AppPage, SimConnectionStatus, SimTelemetry, WeightUnit } from '@shared/ipc'
import { Toaster } from '@/components/ui/sonner'
import { DispatchView } from './DispatchView'
import { FleetView } from './FleetView'
import { LogbookView } from './LogbookView'
import { SettingsView } from './SettingsView'
import { TrackView } from './TrackView'

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

  useEffect(() => {
    // Tab navigation lives in the native menu bar (src/main/menu.ts) — this just applies
    // whichever item was clicked.
    return window.flightdeck.onMenuNavigate(setPage)
  }, [])

  async function handleWeightUnitChange(unit: WeightUnit): Promise<void> {
    setWeightUnit(unit)
    await window.flightdeck.settingsSetWeightUnit(unit)
  }

  return (
    <main className="p-8">
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #ccc'
        }}
      >
        <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }} title={connectionStatusLabel(simStatus)}>
          <span style={{ fontSize: '0.85rem' }}>SimConnect:</span>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: simStatus.state === 'connected' ? '#1e8e3e' : '#d93025',
              display: 'inline-block'
            }}
          />
        </span>
      </div>

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
      <Toaster />
    </main>
  )
}
