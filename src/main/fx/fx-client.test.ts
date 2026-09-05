import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExchangeRate } from './fx-client'

// Real response shape captured live from
// https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP (docs/decisions.md, 2026-09-05)
// — not synthesised.
const REAL_RESPONSE = { amount: 1.0, base: 'USD', date: '2026-09-04', rates: { GBP: 0.7391 } }

describe('fetchExchangeRate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 1 for USD without ever calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchExchangeRate('USD')).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps a real frankfurter.dev response to the target currency’s rate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => REAL_RESPONSE }))
    )

    expect(await fetchExchangeRate('GBP')).toBe(0.7391)
  })

  it('is case-insensitive on the currency code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => REAL_RESPONSE }))
    )

    expect(await fetchExchangeRate('gbp')).toBe(0.7391)
  })

  it('returns null for an unsupported currency code (real 404 shape), not a throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ message: 'not found' }) }))
    )

    expect(await fetchExchangeRate('ZZZ')).toBeNull()
  })

  it('returns null when the network call itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )

    expect(await fetchExchangeRate('GBP')).toBeNull()
  })

  it('returns null on a malformed response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) }))
    )

    expect(await fetchExchangeRate('GBP')).toBeNull()
  })
})
