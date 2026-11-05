import { describe, expect, it } from 'vitest'
import { resolveTwsPresentation, stepViewerTws, type TwsReference } from './twsReference'

describe('manual TWS reference', () => {
  it('steps from unavailable, stops at zero and preserves exact whole knots', () => {
    expect(stepViewerTws(null, 1)).toBe('1')
    expect(stepViewerTws(null, -1)).toBe('0')
    expect(stepViewerTws('0', -1)).toBe('0')
    expect(stepViewerTws('0', 1)).toBe('1')
    expect(stepViewerTws('14', -1)).toBe('13')
    expect(stepViewerTws('9007199254740992', 1)).toBe('9007199254740993')
  })

  it('keeps manual speed independent of optional read-only gust and restores unavailable', () => {
    const missing: TwsReference = { status: 'unavailable' }
    expect(resolveTwsPresentation(missing, null)).toEqual({ speedKnots: null, gustKnots: null, manual: false })
    expect(resolveTwsPresentation(missing, '0')).toEqual({ speedKnots: '0', gustKnots: null, manual: true })
    expect(resolveTwsPresentation(missing, '14').speedKnots).toBe('14')
    expect(resolveTwsPresentation(missing, null).speedKnots).toBeNull()
    const future: TwsReference = { status: 'available', speedKnots: 12, gustKnots: 19, source: 'modelled weather' }
    expect(resolveTwsPresentation(future, '14')).toEqual({ speedKnots: '14', gustKnots: 19, manual: true })
  })
})
