import { describe, expect, it } from 'vitest'
import { parseAircraftInput } from './aircraft-validation'

describe('parseAircraftInput', () => {
  it('accepts the minimum required fields and normalizes optional ones away', () => {
    const result = parseAircraftInput({ registration: ' G-ABCD ', icaoType: 'A320', name: 'Test' })
    expect(result).toEqual({ data: { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' } })
  })

  it('rejects a non-object', () => {
    expect(parseAircraftInput(null)).toEqual({ error: 'Expected an object' })
    expect(parseAircraftInput('G-ABCD')).toEqual({ error: 'Expected an object' })
  })

  it.each(['registration', 'icaoType', 'name'])('rejects a missing required field "%s"', (field) => {
    const input: Record<string, string> = { registration: 'G-ABCD', icaoType: 'A320', name: 'Test' }
    delete input[field]
    expect(parseAircraftInput(input)).toEqual({ error: `"${field}" is required` })
  })

  it('rejects a blank required field', () => {
    expect(parseAircraftInput({ registration: '  ', icaoType: 'A320', name: 'Test' })).toEqual({
      error: '"registration" is required'
    })
  })

  it('carries through valid optional fields', () => {
    const result = parseAircraftInput({
      registration: 'G-ABCD',
      icaoType: 'A320',
      name: 'Test',
      operator: 'Test Air',
      oewKg: 42600,
      maxPax: 180,
      isActive: false
    })
    expect(result).toEqual({
      data: {
        registration: 'G-ABCD',
        icaoType: 'A320',
        name: 'Test',
        operator: 'Test Air',
        oewKg: 42600,
        maxPax: 180,
        isActive: false
      }
    })
  })

  it('rejects a negative weight', () => {
    const result = parseAircraftInput({ registration: 'G-ABCD', icaoType: 'A320', name: 'Test', oewKg: -1 })
    expect(result).toEqual({ error: '"oewKg" must be a non-negative number' })
  })

  it('rejects a non-integer pax count', () => {
    const result = parseAircraftInput({ registration: 'G-ABCD', icaoType: 'A320', name: 'Test', maxPax: 1.5 })
    expect(result).toEqual({ error: '"maxPax" must be a non-negative integer' })
  })

  it('rejects a non-boolean isActive', () => {
    const result = parseAircraftInput({
      registration: 'G-ABCD',
      icaoType: 'A320',
      name: 'Test',
      isActive: 'yes'
    })
    expect(result).toEqual({ error: '"isActive" must be a boolean' })
  })
})
