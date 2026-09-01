import { describe, expect, it } from 'vitest'
import { loadAirports, searchAirportList, searchAirports } from './airport-search'

// Shaped like the real trimmed resources/airports.csv — including the two edge cases
// that motivated csv.ts's quote-aware parser and the icao_code/gps_code fallback: a
// quoted name containing a comma, and a row with no icao_code but a 4-letter gps_code.
const FIXTURE_CSV = `icao,name,municipality,iso_country,type
EGLL,London Heathrow Airport,London,GB,large_airport
KJFK,"John F. Kennedy, International Airport",New York,US,large_airport
K00A,Total RF Heliport,Bensalem,US,heliport
LFPG,Charles de Gaulle Airport,Paris,FR,large_airport`

describe('loadAirports', () => {
  it('parses icao/name/municipality/iso_country from real-shaped rows, including a quoted comma', () => {
    const airports = loadAirports(FIXTURE_CSV)
    expect(airports).toEqual([
      { icao: 'EGLL', name: 'London Heathrow Airport', municipality: 'London', isoCountry: 'GB' },
      {
        icao: 'KJFK',
        name: 'John F. Kennedy, International Airport',
        municipality: 'New York',
        isoCountry: 'US'
      },
      { icao: 'K00A', name: 'Total RF Heliport', municipality: 'Bensalem', isoCountry: 'US' },
      { icao: 'LFPG', name: 'Charles de Gaulle Airport', municipality: 'Paris', isoCountry: 'FR' }
    ])
  })
})

describe('searchAirportList', () => {
  const airports = loadAirports(FIXTURE_CSV)

  it('matches by ICAO code, name, or municipality, case-insensitively', () => {
    expect(searchAirportList(airports, 'egll')).toEqual([airports[0]])
    expect(searchAirportList(airports, 'heathrow')).toEqual([airports[0]])
    expect(searchAirportList(airports, 'paris')).toEqual([airports[3]])
  })

  it('matches a name containing a comma that survived quoted parsing', () => {
    expect(searchAirportList(airports, 'kennedy')).toEqual([airports[1]])
  })

  it('matches an ICAO code sourced from gps_code fallback (no icao_code in the original row)', () => {
    expect(searchAirportList(airports, 'K00A')).toEqual([airports[2]])
  })

  it('returns nothing for a query under 2 characters, to avoid matching everything', () => {
    expect(searchAirportList(airports, 'l')).toEqual([])
    expect(searchAirportList(airports, '')).toEqual([])
  })

  it('returns nothing for a query that matches no row', () => {
    expect(searchAirportList(airports, 'atlantis')).toEqual([])
  })
})

describe('searchAirports (real vendored data)', () => {
  it('finds a well-known airport by ICAO code', () => {
    const results = searchAirports('EGLL')
    expect(results.some((r) => r.icao === 'EGLL')).toBe(true)
  })

  it('finds a well-known airport by name', () => {
    const results = searchAirports('Heathrow')
    expect(results.some((r) => r.icao === 'EGLL')).toBe(true)
  })
})
