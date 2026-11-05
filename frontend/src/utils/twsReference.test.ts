import { describe, expect, it } from 'vitest'
import { parseWholeKnotTws, resolveTwsPresentation, type TwsReference } from './twsReference'

describe('manual TWS reference', () => {
  it('accepts zero and whole knots while rejecting missing, decimal, negative, invalid and unsafe values', () => {
    for (const [input, expected] of [['0', '0'], ['14', '14'], [' 21 ', '21'], ['00014', '14'], ['', null], ['-1', null], ['1.5', null], ['abc', null], ['1e3', null], ['9007199254740992', '9007199254740992']] as const) {
      expect(parseWholeKnotTws(input)).toBe(expected)
    }
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
