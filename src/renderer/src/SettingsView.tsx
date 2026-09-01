import type { WeightUnit } from '@shared/ipc'

export function SettingsView(props: {
  weightUnit: WeightUnit
  onWeightUnitChange: (unit: WeightUnit) => void
}): React.JSX.Element {
  return (
    <div>
      <h1>Settings</h1>

      <section style={{ border: '1px solid #ccc', borderRadius: 4, padding: '1rem', maxWidth: 320 }}>
        <h2 style={{ marginTop: 0 }}>Units</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span>Weights:</span>
          {(['kg', 'lb'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => props.onWeightUnitChange(unit)}
              style={{ fontWeight: props.weightUnit === unit ? 'bold' : 'normal' }}
            >
              {unit}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
