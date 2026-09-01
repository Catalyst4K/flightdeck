import type { NewAircraft } from '@shared/ipc'

const REQUIRED_STRING_FIELDS = ['registration', 'icaoType', 'name'] as const
const OPTIONAL_STRING_FIELDS = [
  'operator',
  'livery',
  'simbriefAirframeId',
  'equip',
  'transponder',
  'pbn',
  'wakeCat',
  'currentIcao',
  'notes'
] as const
const OPTIONAL_NONNEGATIVE_NUMBER_FIELDS = [
  'oewKg',
  'mzfwKg',
  'mtowKg',
  'mlwKg',
  'maxFuelKg',
  'totalHours'
] as const
const OPTIONAL_NONNEGATIVE_INTEGER_FIELDS = ['maxPax', 'totalCycles'] as const

export type AircraftInputResult = { data: NewAircraft } | { error: string }

/**
 * Validates and normalizes aircraft input from an untrusted source (an imported JSON
 * file, and defensively for IPC from the renderer) into a well-typed NewAircraft. Shared
 * by create, update and bulk import so all three enforce the same rules.
 */
export function parseAircraftInput(raw: unknown): AircraftInputResult {
  if (typeof raw !== 'object' || raw === null) return { error: 'Expected an object' }
  const input = raw as Record<string, unknown>
  const fields: Record<string, unknown> = {}

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = input[field]
    if (typeof value !== 'string' || value.trim() === '') return { error: `"${field}" is required` }
    fields[field] = value.trim()
  }

  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = input[field]
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string') return { error: `"${field}" must be a string` }
    fields[field] = value.trim()
  }

  for (const field of OPTIONAL_NONNEGATIVE_NUMBER_FIELDS) {
    const value = input[field]
    if (value === undefined || value === null || value === '') continue
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num) || num < 0) return { error: `"${field}" must be a non-negative number` }
    fields[field] = num
  }

  for (const field of OPTIONAL_NONNEGATIVE_INTEGER_FIELDS) {
    const value = input[field]
    if (value === undefined || value === null || value === '') continue
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(num) || num < 0) return { error: `"${field}" must be a non-negative integer` }
    fields[field] = num
  }

  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') return { error: '"isActive" must be a boolean' }
    fields.isActive = input.isActive
  }

  // Every field above was validated against NewAircraft's exact shape; a single cast
  // here (rather than one per field) keeps the validation loops readable.
  return { data: fields as unknown as NewAircraft }
}
