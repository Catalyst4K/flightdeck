import { describe, expect, it } from 'vitest'
import { parseAircraftInput } from './aircraft-validation'

describe('parseAircraftInput', () => {
  it('accepts the minimum required fields', () => {
    const result = parseAircraftInput({ registration: ' G-ABCD ', icaoType: 'A320' })
    expect(result).toEqual({ data: { registration: 'G-ABCD', icaoType: 'A320' } })
  })

  it('rejects a non-object', () => {
    expect(parseAircraftInput(null)).toEqual({ error: 'Expected an object' })
    expect(parseAircraftInput('G-ABCD')).toEqual({ error: 'Expected an object' })
  })

  it.each(['registration', 'icaoType'])('rejects a missing required field "%s"', (field) => {
    const input: Record<string, string> = { registration: 'G-ABCD', icaoType: 'A320' }
    delete input[field]
    expect(parseAircraftInput(input)).toEqual({ error: `"${field}" is required` })
  })

  it('rejects a blank required field', () => {
    expect(parseAircraftInput({ registration: '  ', icaoType: 'A320' })).toEqual({
      error: '"registration" is required'
    })
  })

  it('carries through valid optional fields', () => {
    const result = parseAircraftInput({
      registration: 'G-ABCD',
      icaoType: 'A320',
      operator: 'Test Air',
      simbriefAirframeId: '123456_1582090020',
      currentIcao: 'EGLL'
    })
    expect(result).toEqual({
      data: {
        registration: 'G-ABCD',
        icaoType: 'A320',
        operator: 'Test Air',
        simbriefAirframeId: '123456_1582090020',
        currentIcao: 'EGLL'
      }
    })
  })

  it('rejects a non-string optional field', () => {
    const result = parseAircraftInput({ registration: 'G-ABCD', icaoType: 'A320', operator: 42 })
    expect(result).toEqual({ error: '"operator" must be a string' })
  })
})
