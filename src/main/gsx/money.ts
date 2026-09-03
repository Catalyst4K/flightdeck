/**
 * GSX receipt amounts are pre-formatted display text, not numbers: `"<local> ~<USD>"`
 * (docs/gsx-notes.md), e.g. `"£1,359.71 ~$ 1,818.96"`, `"₩18,401 ~$ 13.00"`,
 * `"RM75,246.15 ~$ 18,484.36"`. Local prefixes vary in kind (symbol, multi-character
 * code), decimal places vary by currency, and no EUR sample exists to confirm whether a
 * locale that swaps `.`/`,` would parse correctly — so arithmetic is done on the USD side
 * only (reliably `$`-prefixed, `.` decimals, `,` thousands in every sample), and the local
 * string is always displayed verbatim, never re-derived.
 *
 * Returns null — never throws, never guesses — for anything that doesn't contain a
 * recognisable `~$<number>` USD side, rather than risk a confidently-wrong figure.
 */
export function parseUsdAmount(text: string): number | null {
  const tildeIndex = text.indexOf('~')
  if (tildeIndex === -1) return null
  const usdPart = text.slice(tildeIndex + 1).trim()
  const match = /\$\s*([\d,]+(?:\.\d+)?)/.exec(usdPart)
  if (!match) return null
  const numeric = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}
