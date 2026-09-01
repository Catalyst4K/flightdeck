import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WeightUnit } from '@shared/ipc'

export function SettingsView(props: {
  weightUnit: WeightUnit
  onWeightUnitChange: (unit: WeightUnit) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-foreground">Settings</h1>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
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
        </CardContent>
      </Card>
    </div>
  )
}
