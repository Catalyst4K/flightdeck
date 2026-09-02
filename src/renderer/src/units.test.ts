import { describe, expect, it } from 'vitest'
import { formatAltitude } from './units'

describe('formatAltitude', () => {
  it('formats feet rounded to the nearest 100 (a real flight level), thousands-separated', () => {
    expect(formatAltitude(35000, 'ft')).toBe('35,000 ft')
    expect(formatAltitude(35000.6, 'ft')).toBe('35,000 ft')
  })

  it('rounds an odd feet value from a metric conversion to the nearest 100', () => {
    // 11,300 m converted to feet is ~37,073.49 — no real flight level is that precise.
    expect(formatAltitude(11300 / 0.3048, 'ft')).toBe('37,100 ft')
  })

  it('converts to meters assuming the input is real feet', () => {
    expect(formatAltitude(35000, 'm')).toBe('10,668 m')
  })

  it('formats hybrid as plain feet when no native unit/value is given', () => {
    // Fallback for values with no per-point native unit (e.g. cruise altitude).
    expect(formatAltitude(35000, 'hybrid')).toBe('35,000 ft')
  })

  it('formats hybrid using the native unit/value when given, ignoring altitudeFt', () => {
    // A step climb's `native` field (from parseStepClimbs) is the unit/value the point
    // was actually coded in on the OFP — e.g. metres for a Chinese-airspace metric
    // level — so hybrid shows that directly rather than a feet conversion.
    expect(formatAltitude(37073, 'hybrid', { unit: 'm', value: 11300 })).toBe('11,300 m')
    expect(formatAltitude(33000, 'hybrid', { unit: 'ft', value: 33000 })).toBe('33,000 ft')
  })
})
