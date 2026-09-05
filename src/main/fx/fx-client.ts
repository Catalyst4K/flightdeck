/**
 * USD -> display-currency exchange rate for GSX ground-service totals, via Frankfurter
 * (frankfurter.dev) — free, keyless, ECB-based daily rates, no documented rate limit.
 * Chosen over a manual rate the user enters themselves per Callum's 2026-09-05 request
 * for a live rate (docs/decisions.md). Verified against real live responses, not just
 * its docs:
 *
 *   GET https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP
 *   { "amount": 1.0, "base": "USD", "date": "2026-09-04", "rates": { "GBP": 0.7391 } }
 *
 * An unsupported/invalid currency code returns HTTP 404 with a JSON error body (verified
 * against a made-up code) — treated the same as any other fetch failure below: degrade to
 * null (GSX totals just show in USD, same as today) rather than throwing.
 */
export async function fetchExchangeRate(targetCurrency: string): Promise<number | null> {
  const code = targetCurrency.trim().toUpperCase()
  if (code === '' || code === 'USD') return 1

  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${encodeURIComponent(code)}`
    const response = await fetch(url)
    if (!response.ok) return null

    const raw: unknown = await response.json().catch(() => undefined)
    if (typeof raw !== 'object' || raw === null) return null
    const rates = (raw as { rates?: unknown }).rates
    if (typeof rates !== 'object' || rates === null) return null

    const rate = (rates as Record<string, unknown>)[code]
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : null
  } catch {
    return null
  }
}
