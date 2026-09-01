import { useEffect, useState } from 'react'
import type { AirportOption } from '@shared/ipc'

/**
 * Free-text ICAO entry (always works, even if the vendored list is missing an airport)
 * plus a debounced name/ICAO search dropdown (docs/decisions.md — vendored OurAirports
 * slice). Picking a result sets the field to that airport's ICAO code. Shared by the
 * Fleet form's "Current airport" field and Dispatch's departure/destination fields.
 */
export function AirportSearch(props: {
  value: string
  onChange: (icao: string) => void
  placeholder?: string
}): React.JSX.Element {
  const [results, setResults] = useState<AirportOption[]>([])
  const [searching, setSearching] = useState(false)
  // Drives the search — separate from `props.value` on purpose. `props.value` is
  // controlled by the parent and changes for reasons that shouldn't pop a dropdown open
  // (e.g. Dispatch autofilling Departure from the selected aircraft's current airport).
  // Only the input's own onChange (actual typing) updates this, so an external value
  // change never triggers a search.
  const [query, setQuery] = useState('')

  useEffect(() => {
    const q = query.trim()
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      window.flightdeck
        .airportSearch(q)
        .then(setResults)
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function handleInput(value: string): void {
    props.onChange(value)
    setQuery(value)
  }

  function handlePick(icao: string): void {
    props.onChange(icao)
    setQuery('')
    setResults([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder ?? 'ICAO or search by name'}
        onChange={(e) => handleInput(e.target.value.toUpperCase())}
      />
      {searching && <span style={{ fontSize: '0.8rem' }}>Searching…</span>}
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
            <li key={r.icao}>
              <button
                type="button"
                onClick={() => handlePick(r.icao)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.25rem 0.5rem' }}
              >
                {r.icao} — {r.name}
                {r.municipality ? ` (${r.municipality}, ${r.isoCountry})` : ` (${r.isoCountry})`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
