import { describe, expect, it } from 'vitest'
import { formatAltitude } from './units'

describe('formatAltitude', () => {
  it('formats feet as-is, rounded and thousands-separated', () => {
    expect(formatAltitude(35000, 'ft')).toBe('35,000 ft')
    expect(formatAltitude(35000.6, 'ft')).toBe('35,001 ft')
  })

  it('converts to meters assuming the input is real feet', () => {
    expect(formatAltitude(35000, 'm')).toBe('10,668 m')
  })

  it('formats raw as an unconverted /100 FL number, whatever unit the input actually is', () => {
    expect(formatAltitude(35000, 'raw')).toBe('FL350')
    // The whole point of "raw": whatever number SimBrief put in the field, divide by
    // 100 and prefix FL, same rule regardless of whether that number represents real
    // feet or (per a metric flight level, e.g. crossing Chinese airspace) some other
    // scale entirely — 113,000 -> "FL1130" here, same as a real OFP would show for a
    // point it reports as FL1130. No attempt to interpret or convert it.
    expect(formatAltitude(113000, 'raw')).toBe('FL1130')
  })
})
