// One-off vendoring script for resources/runways.csv — landing analysis (M6) needs real
// runway threshold position/heading, deliberately deferred until now (see
// resources/airports.LICENSE.txt's note on this exact file). Same pattern as the other
// vendored OurAirports/OpenFlights/ICAO datasets: fetch, filter, project, write a
// LICENSE.txt sibling recording the source, date and exact filter applied.
//
// Run with: npx tsx scripts/vendor-runways.ts
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/runways.csv'
const OUT_CSV = new URL('../resources/runways.csv', import.meta.url)
const OUT_LICENSE = new URL('../resources/runways.LICENSE.txt', import.meta.url)
const AIRPORTS_CSV = new URL('../resources/airports.csv', import.meta.url)

// Minimal RFC4180 parser (quoted fields, "" as an escaped quote) — mirrors
// src/main/db/csv.ts's parseCsvRows, kept standalone here since this script runs outside
// the app's Vite build.
function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const text = raw.replace(/\r\n/g, '\n')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

async function main(): Promise<void> {
  const response = await fetch(SOURCE_URL)
  if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`)
  const raw = await response.text()
  const [header, ...rows] = parseCsvRows(raw)
  const idx = (name: string): number => {
    const i = header.indexOf(name)
    if (i === -1) throw new Error(`Missing expected column: ${name}`)
    return i
  }

  const iAirportIdent = idx('airport_ident')
  const iClosed = idx('closed')
  const iLeIdent = idx('le_ident')
  const iLeLat = idx('le_latitude_deg')
  const iLeLon = idx('le_longitude_deg')
  const iLeHdg = idx('le_heading_degT')
  const iHeIdent = idx('he_ident')
  const iHeLat = idx('he_latitude_deg')
  const iHeLon = idx('he_longitude_deg')
  const iHeHdg = idx('he_heading_degT')

  // Only ICAO-dispatchable airports — same 4-letter icao_code/gps_code cut
  // resources/airports.csv already made, so runway rows can't outnumber the airports this
  // app can actually route to/from.
  const knownIcaos = new Set(
    parseCsvRows(readFileSync(AIRPORTS_CSV, 'utf-8'))
      .slice(1)
      .map((r) => r[0]?.toUpperCase())
  )

  const outHeader = ['icao', 'ident', 'lat', 'lon', 'heading_true_deg']
  const outRows: string[][] = [outHeader]

  for (const row of rows) {
    const icao = row[iAirportIdent]?.toUpperCase()
    if (!icao || !/^[A-Z0-9]{4}$/.test(icao) || !knownIcaos.has(icao)) continue
    if (row[iClosed] === '1') continue

    // Each runway has two ends, published/queried independently — a landing on 27L needs
    // the 27L threshold specifically, not 09R's. Row per usable end (heading + position
    // both present); an end with neither is useless for crosswind/threshold-distance
    // maths and dropped rather than kept as a row of blanks.
    for (const [ident, lat, lon, hdg] of [
      [row[iLeIdent], row[iLeLat], row[iLeLon], row[iLeHdg]],
      [row[iHeIdent], row[iHeLat], row[iHeLon], row[iHeHdg]]
    ]) {
      if (!ident || !lat || !lon || !hdg) continue
      outRows.push([icao, ident, lat, lon, hdg])
    }
  }

  const csvText = outRows.map((r) => r.map((f) => (f.includes(',') ? `"${f}"` : f)).join(',')).join('\n') + '\n'
  writeFileSync(OUT_CSV, csvText, 'utf-8')

  const license = `runways.csv

Source: ${SOURCE_URL}
        (fetched ${new Date().toISOString().slice(0, 10)})
License: Public domain (OurAirports data)

Trimmed from the full ~48k-row, 20-column, ~3.9 MB source to icao,ident,lat,lon,
heading_true_deg — one row per usable runway end (both heading and threshold position
present), for airports already present in the vendored resources/airports.csv (this
app's ICAO-dispatchable set). Closed runways dropped. ${outRows.length - 1} rows.

Used by src/main/airports/runway-lookup.ts (landing analysis, PLAN.md M6) to resolve a
touchdown position/heading to the nearest matching runway end.
`
  writeFileSync(OUT_LICENSE, license, 'utf-8')

  console.log(`Wrote ${outRows.length - 1} runway-end rows.`)
}

main()
