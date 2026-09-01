// Minimal CSV helpers shared by every vendored/imported CSV source in the app
// (logbook-csv.ts, aircraft-lookup/icao-types.ts). Every real-world source verified so
// far (a live STKP export, the vendored ICAO Doc 8643 designator list) has no quoted or
// embedded-comma fields, so a plain split is enough — no need for a full RFC4180 parser.

export function parseCsvRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(',').map((cell) => cell.trim()))
}

export function columnIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
}
