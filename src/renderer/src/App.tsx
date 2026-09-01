import { useEffect, useState } from 'react'
import type { WeightUnit } from '@shared/ipc'
import { DispatchView } from './DispatchView'
import { FleetView } from './FleetView'

type Page = 'fleet' | 'dispatch'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('fleet')
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb')

  useEffect(() => {
    window.flightdeck.settingsGetWeightUnit().then(setWeightUnit)
  }, [])

  async function handleWeightUnitChange(unit: WeightUnit): Promise<void> {
    setWeightUnit(unit)
    await window.flightdeck.settingsSetWeightUnit(unit)
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <nav
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #ccc'
        }}
      >
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => setPage('fleet')}
            style={{ fontWeight: page === 'fleet' ? 'bold' : 'normal' }}
          >
            Fleet
          </button>
          <button
            type="button"
            onClick={() => setPage('dispatch')}
            style={{ fontWeight: page === 'dispatch' ? 'bold' : 'normal' }}
          >
            Dispatch
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem' }}>Weights:</span>
          {(['kg', 'lb'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => handleWeightUnitChange(unit)}
              style={{ fontWeight: weightUnit === unit ? 'bold' : 'normal' }}
            >
              {unit}
            </button>
          ))}
        </div>
      </nav>

      {page === 'fleet' ? <FleetView weightUnit={weightUnit} /> : <DispatchView weightUnit={weightUnit} />}
    </main>
  )
}
