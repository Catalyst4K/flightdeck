import { useEffect, useState } from 'react'
import type { Aircraft } from '@shared/ipc'

export default function App(): React.JSX.Element {
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [registration, setRegistration] = useState('')
  const [icaoType, setIcaoType] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    window.flightdeck.aircraftList().then(setAircraft)
  }, [])

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const created = await window.flightdeck.aircraftCreate({ registration, icaoType, name })
    setAircraft((current) => [...current, created])
    setRegistration('')
    setIcaoType('')
    setName('')
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>Flightdeck</h1>
      <p>M0 skeleton — this proves the DB round-trips through IPC.</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          placeholder="Registration"
          value={registration}
          onChange={(e) => setRegistration(e.target.value)}
          required
        />
        <input placeholder="ICAO type" value={icaoType} onChange={(e) => setIcaoType(e.target.value)} required />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Add</button>
      </form>

      <ul>
        {aircraft.map((a) => (
          <li key={a.id}>
            {a.registration} — {a.icaoType} — {a.name}
          </li>
        ))}
      </ul>
    </main>
  )
}
