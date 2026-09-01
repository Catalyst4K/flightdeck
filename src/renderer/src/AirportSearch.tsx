import { useEffect, useState } from 'react'
import type { AirportOption } from '@shared/ipc'

/**
 * Free-text ICAO entry (always works, even if the vendored list is missing an airport)
 * plus a debounced name/ICAO search dropdown (docs/decisions.md — vendored OurAirports
 * slice). Picking a result sets the field to that airport's ICAO code. Shared by the
 * Fleet form's "Current ICAO" field and Dispatch's departure/destination fields.
 */
export function AirportSearch(props: {
  value: string
  onChange: (icao: string) => void
  placeholder?: string
}): React.JSX.Element {
  const [results, setResults] = useState<AirportOption[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = props.value.trim()
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
  }, [props.value])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder ?? 'ICAO or search by name'}
        onChange={(e) => props.onChange(e.target.value.toUpperCase())}
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
                onClick={() => {
                  props.onChange(r.icao)
                  setResults([])
                }}
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
