// SI is stored internally end-to-end; convert to aviation units only here, at the UI
// layer, per docs/decisions.md §5.
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
