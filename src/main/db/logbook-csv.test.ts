import { describe, expect, it } from 'vitest'
import { parseCsvRows, parseStkpDateTime, parseStkpRow } from './logbook-csv'

// Real header + a handful of real rows from a STKP export, not synthesised — same rigor
// as the SimBrief OFP schema in M3.
const HEADER =
  'DepartureICAO, ArrivalICAO, AircraftReg, AirframeICAO, Callsign, FlightNo, Network, ' +
  'DepDate (DD/MM/YY), DepTime (HHMM), ArrDate (DD/MM/YY), ArrTime (HHMM)'
const SAMPLE_CSV = `${HEADER}
EGLL,RKSI,HL8275,B77W,KAL667,KAL667,,21/08/2026,2216,22/08/2026,1050
ZBAA,EGLL,G-XWBS,A35K,BAW32,BAW32,,20/08/2026,2210,21/08/2026,1034
EGLL,VHHH,B-HNR,B77W,CX250,CPA250,,01/11/2025,2257,02/11/2025,1201`

describe('parseCsvRows', () => {
  it('splits into trimmed cells, dropping blank lines', () => {
    const rows = parseCsvRows('a, b,c\n\nd,e, f\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f']
    ])
  })
})

describe('parseStkpDateTime', () => {
  it('parses the real four-digit-year format as UTC, despite the column header claiming DD/MM/YY', () => {
    expect(parseStkpDateTime('21/08/2026', '2216')).toBe('2026-08-21T22:16:00.000Z')
  })

  it('returns null for malformed input, including the header-claimed two-digit-year format', () => {
    expect(parseStkpDateTime('2026-08-21', '2216')).toBeNull()
    expect(parseStkpDateTime('21/08/26', '2216')).toBeNull()
    expect(parseStkpDateTime('21/08/2026', '10:16')).toBeNull()
  })
})

describe('parseStkpRow', () => {
  const [header, ...rows] = parseCsvRows(SAMPLE_CSV)

  it('parses a real row into a typed record', () => {
    const result = parseStkpRow(header, rows[0])
    expect(result).toEqual({
      data: {
        depIcao: 'EGLL',
        arrIcao: 'RKSI',
        registration: 'HL8275',
        icaoType: 'B77W',
        flightNumber: 'KAL667',
        actualOutUtc: '2026-08-21T22:16:00.000Z',
        actualInUtc: '2026-08-22T10:50:00.000Z'
      }
    })
  })

  it('does not pick up Callsign as the flight number when it differs from FlightNo', () => {
    // Row 3: Callsign=CX250, FlightNo=CPA250 — these genuinely differ in a real export.
    const result = parseStkpRow(header, rows[2])
    expect('data' in result && result.data.flightNumber).toBe('CPA250')
  })

  it('flags a row with a missing required field', () => {
    const badRow = [
      '',
      'RKSI',
      'HL8275',
      'B77W',
      'KAL667',
      'KAL667',
      '',
      '21/08/26',
      '2216',
      '22/08/26',
      '1050'
    ]
    const result = parseStkpRow(header, badRow)
    expect(result).toEqual({ error: 'missing or malformed required field' })
  })

  it('flags a row with an unparseable date', () => {
    const badRow = [
      'EGLL',
      'RKSI',
      'HL8275',
      'B77W',
      'KAL667',
      'KAL667',
      '',
      '2026-08-21',
      '2216',
      '22/08/26',
      '1050'
    ]
    const result = parseStkpRow(header, badRow)
    expect(result).toEqual({ error: 'missing or malformed required field' })
  })
})
