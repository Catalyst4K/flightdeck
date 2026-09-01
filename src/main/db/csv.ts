// Minimal CSV helpers shared by every vendored/imported CSV source in the app
// (logbook-csv.ts, aircraft-lookup/icao-types.ts, airports/airport-search.ts). Two of
// those three sources have no quoted/embedded-comma fields verified against real data,
// but the vendored OurAirports slice does (e.g. `"Total RF Heliport"`), so this parser is
// RFC4180-minimal (quoted fields, "" as an escaped quote, commas inside quotes) — a
// strict superset of a plain comma-split, so it doesn't change behavior for the two
// quote-free sources. Line splitting still happens first on `\r?\n`, so a field with an
// embedded newline isn't supported — none of the three real sources have one.

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur.trim())
  return cells
}

export function parseCsvRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine)
}

export function columnIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
}
