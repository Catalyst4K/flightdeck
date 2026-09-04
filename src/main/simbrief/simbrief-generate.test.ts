import { describe, expect, it } from 'vitest'
import type { DispatchOpenSimBriefParams } from '../../shared/ipc'
import { buildGenerateUrl } from './simbrief-generate'

const BASE: DispatchOpenSimBriefParams = {
  origIcao: 'EGLL',
  destIcao: 'WSSS',
  icaoType: 'A388',
  simbriefAirframeId: null
}

describe('buildGenerateUrl', () => {
  it('builds a minimal URL against the keyed worker endpoint', () => {
    const url = new URL(buildGenerateUrl(BASE, 'abc123', 1788307200))
    expect(url.origin + url.pathname).toBe('https://www.simbrief.com/ofp/ofp.loader.api.php')
    expect(url.searchParams.get('orig')).toBe('EGLL')
    expect(url.searchParams.get('dest')).toBe('WSSS')
    expect(url.searchParams.get('type')).toBe('A388')
    expect(url.searchParams.get('apicode')).toBe('abc123')
    expect(url.searchParams.get('timestamp')).toBe('1788307200')
    expect(url.searchParams.get('outputpage')).toBe('flightdeck.local/generate')
  })

  it('prefers a saved airframe ID over simbriefType and icaoType for `type`', () => {
    const url = new URL(
      buildGenerateUrl({ ...BASE, simbriefAirframeId: '123456_1582090020', simbriefType: 'A20N' }, 'abc123', 1788307200)
    )
    expect(url.searchParams.get('type')).toBe('123456_1582090020')
  })

  it('prefers simbriefType over the bare icaoType when there is no saved airframe', () => {
    const url = new URL(buildGenerateUrl({ ...BASE, simbriefType: 'A20N' }, 'abc123', 1788307200))
    expect(url.searchParams.get('type')).toBe('A20N')
  })

  it('appends airline/fltnum/date/deph/depm only when present', () => {
    const withExtras: DispatchOpenSimBriefParams = {
      ...BASE,
      airlineIcao: 'BAW',
      flightNumber: '002',
      departure: { dateEpochSeconds: 1788307200, hour: 18, minute: 25 }
    }
    const url = new URL(buildGenerateUrl(withExtras, 'abc123', 1788307200))
    expect(url.searchParams.get('airline')).toBe('BAW')
    expect(url.searchParams.get('fltnum')).toBe('002')
    expect(url.searchParams.get('date')).toBe('1788307200')
    expect(url.searchParams.get('deph')).toBe('18')
    expect(url.searchParams.get('depm')).toBe('25')

    const withoutExtras = new URL(buildGenerateUrl(BASE, 'abc123', 1788307200))
    expect(withoutExtras.searchParams.has('airline')).toBe(false)
    expect(withoutExtras.searchParams.has('fltnum')).toBe(false)
    expect(withoutExtras.searchParams.has('date')).toBe(false)
  })

  it('passes through advanced dispatch-options extras', () => {
    const url = new URL(buildGenerateUrl({ ...BASE, extra: [['units', 'KGS'], ['contpct', '0.03']] }, 'abc123', 1788307200))
    expect(url.searchParams.get('units')).toBe('KGS')
    expect(url.searchParams.get('contpct')).toBe('0.03')
  })
})
