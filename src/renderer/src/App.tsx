import { useState } from 'react'
import { DispatchView } from './DispatchView'
import { FleetView } from './FleetView'

type Page = 'fleet' | 'dispatch'

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('fleet')

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid #ccc' }}>
        <button
          type="button"
          onClick={() => setPage('fleet')}
          style={{ fontWeight: page === 'fleet' ? 'bold' : 'normal' }}
        >
          Fleet
        </button>
        <button
          type="button"
          onClick={() => setPage('dispatch')}
          style={{ fontWeight: page === 'dispatch' ? 'bold' : 'normal' }}
        >
          Dispatch
        </button>
      </nav>

      {page === 'fleet' ? <FleetView /> : <DispatchView />}
    </main>
  )
}
