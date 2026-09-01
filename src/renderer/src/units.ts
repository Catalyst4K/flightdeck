// SI is stored internally end-to-end; convert to aviation units only here, at the UI
// layer, per docs/decisions.md §5.
import type { WeightUnit } from '@shared/ipc'

const KG_PER_LB = 0.45359237

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

const M_PER_FT = 0.3048

export function mToFt(m: number): number {
  return m / M_PER_FT
}

/** Converts a stored kg value to the user's preferred display unit. */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg)
}

/** Converts a value in the user's preferred unit back to kg for storage. */
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value)
}

export function formatWeight(kg: number | null, unit: WeightUnit): string {
  return kg == null ? '—' : `${Math.round(kgToUnit(kg, unit)).toLocaleString()} ${unit}`
}
