import { useEffect, useState } from 'react'
import type { Aircraft, AircraftTypeOption, NewAircraft } from '@shared/ipc'
import { AirportSearch } from './AirportSearch'

interface FormState {
  registration: string
  icaoType: string
  operator: string
  simbriefAirframeId: string
  currentIcao: string
}

const EMPTY_FORM: FormState = {
  registration: '',
  icaoType: '',
  operator: '',
  simbriefAirframeId: '',
  currentIcao: ''
}

function toFormState(a: Aircraft): FormState {
  return {
    registration: a.registration,
    icaoType: a.icaoType,
    operator: a.operator ?? '',
    simbriefAirframeId: a.simbriefAirframeId ?? '',
    currentIcao: a.currentIcao ?? ''
  }
}

function toNewAircraft(f: FormState): NewAircraft {
  const str = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim())

  return {
    registration: f.registration.trim(),
    icaoType: f.icaoType.trim(),
    operator: str(f.operator),
    simbriefAirframeId: str(f.simbriefAirframeId),
    currentIcao: str(f.currentIcao)
  }
}

function Field(props: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}): React.JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
      {props.label}
      <input
        type="text"
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
  onSubmit: (data: NewAircraft) => Promise<void>
  onCancel: () => void
}): React.JSX.Element {
  const [form, setForm] = useState<FormState>(props.initial ? toFormState(props.initial) : EMPTY_FORM)
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
        operator: current.operator || result.operator || current.operator
      }))
      setLookupStatus(`Found: ${result.operator ?? 'unknown operator'}, ${result.icaoType}`)
    } catch (err) {
      setLookupStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setLookingUp(false)
    }
  }

  function handleTypeSelect(option: AircraftTypeOption): void {
    // A type-search pick is an explicit, single-target choice, unlike the registration
    // lookup above which fills several blanks at once and shouldn't clobber an
    // in-progress edit.
    set('icaoType', option.icaoType)
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await props.onSubmit(toNewAircraft(form))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 480 }}
    >
      {error && <p style={{ color: '#b00020' }}>{error}</p>}

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

      {lookupStatus && <p style={{ fontSize: '0.85rem' }}>{lookupStatus}</p>}

      <div>
        <AircraftTypeSearch onSelect={handleTypeSelect} />
        <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
          Registration lookup and aircraft type data via adsbdb.com (PlaneBase).
        </p>
      </div>

      <Field label="Airline" value={form.operator} onChange={(v) => set('operator', v)} />
      <Field
        label="SimBrief profile"
        value={form.simbriefAirframeId}
        onChange={(v) => set('simbriefAirframeId', v)}
      />

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
        Current ICAO
        <AirportSearch value={form.currentIcao} onChange={(v) => set('currentIcao', v)} />
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
