import { useEffect, useState } from 'react'
import type { Aircraft, AircraftTypeOption, NewAircraft, WeightUnit } from '@shared/ipc'
import { kgToUnit, unitToKg } from './units'

interface FormState {
  registration: string
  icaoType: string
  name: string
  operator: string
  livery: string
  simbriefAirframeId: string
  oewValue: string
  mzfwValue: string
  mtowValue: string
  mlwValue: string
  maxFuelValue: string
  maxPax: string
  equip: string
  transponder: string
  pbn: string
  wakeCat: string
  currentIcao: string
  totalHours: string
  totalCycles: string
  isActive: boolean
  notes: string
}

const EMPTY_FORM: FormState = {
  registration: '',
  icaoType: '',
  name: '',
  operator: '',
  livery: '',
  simbriefAirframeId: '',
  oewValue: '',
  mzfwValue: '',
  mtowValue: '',
  mlwValue: '',
  maxFuelValue: '',
  maxPax: '',
  equip: '',
  transponder: '',
  pbn: '',
  wakeCat: '',
  currentIcao: '',
  totalHours: '0',
  totalCycles: '0',
  isActive: true,
  notes: ''
}

function toFormState(a: Aircraft, unit: WeightUnit): FormState {
  const weight = (kg: number | null): string => (kg == null ? '' : String(Math.round(kgToUnit(kg, unit))))
  return {
    registration: a.registration,
    icaoType: a.icaoType,
    name: a.name,
    operator: a.operator ?? '',
    livery: a.livery ?? '',
    simbriefAirframeId: a.simbriefAirframeId ?? '',
    oewValue: weight(a.oewKg),
    mzfwValue: weight(a.mzfwKg),
    mtowValue: weight(a.mtowKg),
    mlwValue: weight(a.mlwKg),
    maxFuelValue: weight(a.maxFuelKg),
    maxPax: a.maxPax == null ? '' : String(a.maxPax),
    equip: a.equip ?? '',
    transponder: a.transponder ?? '',
    pbn: a.pbn ?? '',
    wakeCat: a.wakeCat ?? '',
    currentIcao: a.currentIcao ?? '',
    totalHours: String(a.totalHours),
    totalCycles: String(a.totalCycles),
    isActive: a.isActive,
    notes: a.notes ?? ''
  }
}

function toNewAircraft(f: FormState, unit: WeightUnit): NewAircraft {
  const num = (s: string): number | undefined => (s.trim() === '' ? undefined : Number(s))
  const kgFromUnit = (s: string): number | undefined => {
    const n = num(s)
    return n === undefined ? undefined : unitToKg(n, unit)
  }
  const str = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim())

  return {
    registration: f.registration.trim(),
    icaoType: f.icaoType.trim(),
    name: f.name.trim(),
    operator: str(f.operator),
    livery: str(f.livery),
    simbriefAirframeId: str(f.simbriefAirframeId),
    oewKg: kgFromUnit(f.oewValue),
    mzfwKg: kgFromUnit(f.mzfwValue),
    mtowKg: kgFromUnit(f.mtowValue),
    mlwKg: kgFromUnit(f.mlwValue),
    maxFuelKg: kgFromUnit(f.maxFuelValue),
    maxPax: num(f.maxPax),
    equip: str(f.equip),
    transponder: str(f.transponder),
    pbn: str(f.pbn),
    wakeCat: str(f.wakeCat),
    currentIcao: str(f.currentIcao),
    totalHours: num(f.totalHours) ?? 0,
    totalCycles: num(f.totalCycles) ?? 0,
    isActive: f.isActive,
    notes: str(f.notes)
  }
}

function Field(props: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
}): React.JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
      {props.label}
      <input
        type={props.type ?? 'text'}
        value={props.value}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}

/**
 * Manual fallback for when a registration lookup fails or the registration is fictional
 * — searches the vendored ICAO Doc 8643 type-designator list (docs/decisions.md).
 * Debounced so it doesn't fire on every keystroke.
 */
function AircraftTypeSearch(props: { onSelect: (option: AircraftTypeOption) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AircraftTypeOption[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      window.flightdeck
        .aircraftTypeSearch(q)
        .then(setResults)
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        Search aircraft type
        <input
          type="text"
          value={query}
          placeholder="e.g. A350, Boeing, B77W"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {searching && <span>Searching…</span>}
      {results.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            border: '1px solid #ccc',
            maxHeight: 160,
            overflowY: 'auto'
          }}
        >
          {results.map((r) => (
            <li key={`${r.icaoType}-${r.manufacturer}-${r.model}`}>
              <button
                type="button"
                onClick={() => {
                  props.onSelect(r)
                  setQuery('')
                  setResults([])
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.25rem 0.5rem' }}
              >
                {r.manufacturer} — {r.model} ({r.icaoType})
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AircraftForm(props: {
  initial?: Aircraft
  weightUnit: WeightUnit
  onSubmit: (data: NewAircraft) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<FormState>(
    props.initial ? toFormState(props.initial, props.weightUnit) : EMPTY_FORM
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lookupStatus, setLookupStatus] = useState<string | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleLookup(): Promise<void> {
    const registration = form.registration.trim()
    if (!registration) {
      setLookupStatus('Enter a registration first.')
      return
    }
    setLookingUp(true)
    setLookupStatus(null)
    try {
      const result = await window.flightdeck.aircraftLookupByRegistration(registration)
      if (!result) {
        setLookupStatus(`No match for "${registration}" — search for the type below.`)
        return
      }
      // Fills blanks only — never overwrites something already typed/edited.
      setForm((current) => ({
        ...current,
        icaoType: current.icaoType || result.icaoType,
        name: current.name || result.name,
        operator: current.operator || result.operator || current.operator
      }))
      setLookupStatus(`Found: ${result.operator ?? 'unknown operator'}, ${result.name}`)
    } catch (err) {
      setLookupStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setLookingUp(false)
    }
  }

  function handleTypeSelect(option: AircraftTypeOption): void {
    // A type-search pick is an explicit, single-target choice — it sets icaoType/wakeCat
    // directly rather than only filling blanks (unlike the registration lookup above,
    // which fills several fields at once and shouldn't clobber an in-progress edit).
    setForm((current) => ({
      ...current,
      icaoType: option.icaoType,
      wakeCat: option.wakeCat,
      name: current.name || `${option.manufacturer} ${option.model}`
    }))
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await props.onSubmit(toNewAircraft(form, props.weightUnit))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldsetStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '0.75rem'
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 720 }}
    >
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

      <fieldset style={fieldsetStyle}>
        <legend>Basic</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
          Registration
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input
              type="text"
              value={form.registration}
              required
              onChange={(e) => set('registration', e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="button" onClick={handleLookup} disabled={lookingUp}>
              {lookingUp ? '…' : 'Look up'}
            </button>
          </div>
        </div>
        <Field label="ICAO type" value={form.icaoType} onChange={(v) => set('icaoType', v)} required />
        <Field label="Name" value={form.name} onChange={(v) => set('name', v)} required />
        <Field label="Operator" value={form.operator} onChange={(v) => set('operator', v)} />
        <Field label="Livery" value={form.livery} onChange={(v) => set('livery', v)} />
        <Field
          label="SimBrief airframe ID"
          value={form.simbriefAirframeId}
          onChange={(v) => set('simbriefAirframeId', v)}
        />
      </fieldset>

      {lookupStatus && <p style={{ fontSize: '0.85rem' }}>{lookupStatus}</p>}

      <div>
        <AircraftTypeSearch onSelect={handleTypeSelect} />
        <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
          Registration lookup and aircraft type data via adsbdb.com (PlaneBase).
        </p>
      </div>

      <fieldset style={fieldsetStyle}>
        <legend>Performance ({props.weightUnit})</legend>
        <Field label="OEW" value={form.oewValue} onChange={(v) => set('oewValue', v)} type="number" />
        <Field label="MZFW" value={form.mzfwValue} onChange={(v) => set('mzfwValue', v)} type="number" />
        <Field label="MTOW" value={form.mtowValue} onChange={(v) => set('mtowValue', v)} type="number" />
        <Field label="MLW" value={form.mlwValue} onChange={(v) => set('mlwValue', v)} type="number" />
        <Field
          label="Max fuel"
          value={form.maxFuelValue}
          onChange={(v) => set('maxFuelValue', v)}
          type="number"
        />
        <Field label="Max pax" value={form.maxPax} onChange={(v) => set('maxPax', v)} type="number" />
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend>Ops</legend>
        <Field label="Equip" value={form.equip} onChange={(v) => set('equip', v)} />
        <Field label="Transponder" value={form.transponder} onChange={(v) => set('transponder', v)} />
        <Field label="PBN" value={form.pbn} onChange={(v) => set('pbn', v)} />
        <Field label="Wake category" value={form.wakeCat} onChange={(v) => set('wakeCat', v)} />
        <Field label="Current ICAO" value={form.currentIcao} onChange={(v) => set('currentIcao', v)} />
      </fieldset>

      <fieldset style={fieldsetStyle}>
        <legend>Status</legend>
        <Field
          label="Total hours"
          value={form.totalHours}
          onChange={(v) => set('totalHours', v)}
          type="number"
        />
        <Field
          label="Total cycles"
          value={form.totalCycles}
          onChange={(v) => set('totalCycles', v)}
          type="number"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          Active
        </label>
      </fieldset>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
        Notes
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
      </label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={props.onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}
