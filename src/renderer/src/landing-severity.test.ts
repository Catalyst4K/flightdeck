import { describe, expect, it } from 'vitest'
import { classifyLanding } from './landing-severity'

const THRESHOLDS = { firmFpm: 480, hardFpm: 600 }

// -1 m/s ≈ -196.85 fpm; -2.5 m/s ≈ -492.1 fpm; -3.5 m/s ≈ -688.98 fpm.
describe('classifyLanding', () => {
  it('is "none" for a gentle landing, well under the firm threshold', () => {
    expect(classifyLanding(-1, THRESHOLDS)).toBe('none')
  })

  it('is "none" for a value just below the firm threshold', () => {
    expect(classifyLanding(-2.4, THRESHOLDS)).toBe('none')
  })

  it('is "firm" exactly at the firm threshold', () => {
    // 480 fpm in m/s, negative (descending).
    expect(classifyLanding(-(480 * 0.3048) / 60, THRESHOLDS)).toBe('firm')
  })

  it('is "firm" between the two thresholds', () => {
    expect(classifyLanding(-2.5, THRESHOLDS)).toBe('firm')
  })

  it('is "hard" exactly at the hard threshold', () => {
    expect(classifyLanding(-(600 * 0.3048) / 60, THRESHOLDS)).toBe('hard')
  })

  it('is "hard" well above the hard threshold', () => {
    expect(classifyLanding(-3.5, THRESHOLDS)).toBe('hard')
  })

  it('classifies on magnitude regardless of sign', () => {
    expect(classifyLanding(3.5, THRESHOLDS)).toBe('hard')
  })

  it('respects custom thresholds rather than a hardcoded constant', () => {
    const looseThresholds = { firmFpm: 1000, hardFpm: 1500 }
    expect(classifyLanding(-3.5, looseThresholds)).toBe('none')
  })
})
