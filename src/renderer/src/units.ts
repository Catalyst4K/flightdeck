// SI is stored internally end-to-end; convert to aviation units only here, at the UI
// layer, per docs/decisions.md §5.
import type { AltitudeUnit, WeightUnit } from '@shared/ipc'

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

const MS_PER_KT = 0.514444

export function msToKt(ms: number): number {
  return ms / MS_PER_KT
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

/**
 * Formats an altitude that came from a SimBrief OFP — `altitudeFt` should be the raw
 * number SimBrief reported (or its exact inverse-converted equivalent, e.g.
 * `mToFt(cruiseAltM)`), NOT a value already known to be real feet. 'ft'/'m' both
 * assume it is real feet; 'raw' doesn't interpret it at all, just formats it the way an
 * OFP would (see the AltitudeUnit doc comment in shared/ipc.ts for why that distinction
 * matters for a flight crossing into e.g. Chinese metric-level airspace).
 */
export function formatAltitude(altitudeFt: number, unit: AltitudeUnit): string {
  switch (unit) {
    case 'ft':
      return `${Math.round(altitudeFt).toLocaleString()} ft`
    case 'm':
      return `${Math.round(altitudeFt * M_PER_FT).toLocaleString()} m`
    case 'raw':
      return `FL${Math.round(altitudeFt / 100)}`
  }
}
