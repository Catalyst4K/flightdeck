// Local reference list for the Fleet "Airline" search-by-name/ICAO field. Vendored data,
// not a live API: resources/airlines.csv — a trimmed slice of the OpenFlights airline
// database (ODbL-licensed source, see resources/airlines.LICENSE.txt and
// docs/decisions.md). Verified real file: 5886 rows, columns name,icao,iata — no
// quoted/embedded-comma fields except a handful of airline names, so parseCsvRows'
// quote-aware parsing still applies (same as icao-types.ts/airport-search.ts).
//
// resources/airline-aliases.csv (same columns, hand-maintained, not from OpenFlights) adds
// a handful of well-known rebrand/historical names that a frozen upstream dataset doesn't
// have under that name — e.g. Cathay Dragon flew under that name for its last four years
// but is only in OpenFlights as "Dragonair" (its pre-2016 name), so searching the actual
// name people fly it under today found nothing. adsbdb.com's own /v0/airline endpoint was
// considered as a replacement (docs/decisions.md) but only does exact ICAO/IATA lookup, no
// name search, so it can't back this dropdown — it's used elsewhere, for resolving an
// already-known code.
//
// Bundled via Vite's `?raw` import, same pattern as the other two vendored CSVs.
import type { AirlineOption } from '@shared/ipc'
import { columnIndex, parseCsvRows } from '../db/csv'
import airlinesRaw from '../../../resources/airlines.csv?raw'
import airlineAliasesRaw from '../../../resources/airline-aliases.csv?raw'

export function loadAirlines(raw: string): AirlineOption[] {
  const [header, ...rows] = parseCsvRows(raw)
  const nameIdx = columnIndex(header, 'name')
  const icaoIdx = columnIndex(header, 'icao')
  const iataIdx = columnIndex(header, 'iata')

  return rows
    .filter((row) => row[nameIdx] && row[icaoIdx])
    .map((row) => ({
      name: row[nameIdx],
      icao: row[icaoIdx],
      iata: row[iataIdx] || ''
    }))
}

const MAX_RESULTS = 20

/** Case-insensitive substring match over airline name and ICAO code. */
export function searchAirlineList(airlines: AirlineOption[], query: string): AirlineOption[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const results: AirlineOption[] = []
  for (const a of airlines) {
    if (a.name.toLowerCase().includes(q) || a.icao.toLowerCase().includes(q)) {
      results.push(a)
      if (results.length >= MAX_RESULTS) break
    }
  }
  return results
}

const ALL_AIRLINES = [...loadAirlines(airlinesRaw), ...loadAirlines(airlineAliasesRaw)]

export function searchAirlines(query: string): AirlineOption[] {
  return searchAirlineList(ALL_AIRLINES, query)
}
