import { describe, expect, it } from 'vitest'
import type { SogChartPoint } from './metricChartData'
import { buildSogManeuverPath, calculateSogManeuverInsights, calculateSogProfileRecovery, compareSogManeuverInsight, compareSogProfileRecovery, sogManeuverAxisBounds } from './maneuverSogInsights'

function points(value: number): SogChartPoint[] {
  return Array.from({ length: 51 }, (_, index) => ({ time: (index - 25) * 1_000, sog: value }))
}

describe('SOG maneuver insights', () => {
  it('uses all inclusive entry offsets and the full minimum window from raw supported medians', () => {
    const curve = points(5)
    curve[0].sog = 3
    curve[10].sog = 7
    curve[15].sog = 2
    curve[35].sog = 1.5
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: 5, minimumSog: 1.5, exitSog: 5 })
  })

  it('requires 8 of 11 Entry offsets and takes the median of supported values only', () => {
    const curve = points(5)
    for (let index = 0; index < 11; index += 1) curve[index].sog = index + 1
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: 6, minimumSog: 5, exitSog: 5 })

    for (let index = 0; index < 3; index += 1) curve[index].sog = null
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: 7.5, minimumSog: 5, exitSog: 5 })

    curve[3].sog = null
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: null, minimumSog: 5, exitSog: 5 })
  })

  it('preserves unsupported gaps and still requires every Minimum offset', () => {
    const entryGap = points(5)
    entryGap[5].sog = null
    expect(calculateSogManeuverInsights(entryGap)).toEqual({ entrySog: 5, minimumSog: 5, exitSog: 5 })
    const minimumGap = points(5)
    minimumGap[35].sog = null
    expect(calculateSogManeuverInsights(minimumGap)).toEqual({ entrySog: 5, minimumSog: null, exitSog: 5 })
  })

  it('requires 8 of 11 Exit offsets and takes the median without filling gaps', () => {
    const curve = points(5)
    for (let index = 40; index <= 50; index += 1) curve[index].sog = index - 39
    expect(calculateSogManeuverInsights(curve).exitSog).toBe(6)
    for (let index = 40; index < 43; index += 1) curve[index].sog = null
    expect(calculateSogManeuverInsights(curve).exitSog).toBe(7.5)
    curve[43].sog = null
    expect(calculateSogManeuverInsights(curve).exitSog).toBeNull()
  })

  it('applies the inclusive 0.2 kt similarity threshold to Entry, Minimum and Exit', () => {
    const curve = points(5)
    for (let index = 0; index <= 10; index += 1) curve[index].sog = 4
    expect(calculateSogManeuverInsights(curve).exitSog).toBe(5)
    expect(compareSogManeuverInsight(5, 5.2)).toBe('Similar')
    expect(compareSogManeuverInsight(5, 5.201)).toBe('C higher')
    expect(compareSogManeuverInsight(5.2, 5)).toBe('Similar')
    expect(compareSogManeuverInsight(5.3, 5)).toBe('P higher')
    expect(compareSogManeuverInsight(5, null)).toBe('—')
  })
})

describe('center-relative SOG profile recovery', () => {
  it('recovers at the first supported threshold crossing after a pre-center dip, including t=0', () => {
    const curve = points(5)
    curve[24].sog = 4
    curve[25].sog = 4.75
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'recovered', offsetSeconds: 0, sogKnots: 4.75 })
  })

  it('recovers after a post-center dip and does not infer recovery from an already high t=0', () => {
    const curve = points(5)
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'unavailable' })
    curve[27].sog = 4
    curve[28].sog = 4.75
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'recovered', offsetSeconds: 3, sogKnots: 4.75 })
    curve[27].sog = 5
    curve[22].sog = 4
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'unavailable' })
  })

  it('never bridges weak-support gaps from dip to crossing or across t=0', () => {
    const curve = points(5)
    curve[27].sog = 4
    curve[28].sog = null
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'unavailable' })
    const beforeCenter = points(5)
    beforeCenter[24].sog = 4
    beforeCenter[25].sog = null
    expect(calculateSogProfileRecovery(beforeCenter, 5)).toEqual({ status: 'unavailable' })
  })

  it('distinguishes evidenced non-recovery through +25s from missing evidence', () => {
    const curve = points(5)
    for (let index = 27; index <= 50; index += 1) curve[index].sog = 4
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'not_reached' })
    curve[50].sog = null
    expect(calculateSogProfileRecovery(curve, 5)).toEqual({ status: 'unavailable' })
    expect(calculateSogProfileRecovery(points(5), null)).toEqual({ status: 'unavailable' })
  })

  it('compares only established recovery seconds', () => {
    const atTwo = { status: 'recovered', offsetSeconds: 2, sogKnots: 5 } as const
    const atThree = { status: 'recovered', offsetSeconds: 3, sogKnots: 5 } as const
    expect(compareSogProfileRecovery(atTwo, atTwo)).toBe('Same recovery time')
    expect(compareSogProfileRecovery(atTwo, atThree)).toBe('P earlier')
    expect(compareSogProfileRecovery(atThree, atTwo)).toBe('C earlier')
    expect(compareSogProfileRecovery(atTwo, { status: 'not_reached' })).toBe('')
  })
})

describe('shared maneuver SOG axis', () => {
  it.each([
    [3.2, 5.3, 3, 6], [4.1, 4.9, 3, 6], [0.5, 2.2, 0, 3],
  ])('rounds %s–%s with margin and at least 3 kt span', (low, high, minimum, maximum) => {
    expect(sogManeuverAxisBounds([{ time: -25_000, sog: low }], [{ time: 25_000, sog: high }]))
      .toEqual({ minimum, maximum })
  })

  it('uses visible P/C values, keeps a nonnegative minimum and defines empty bounds', () => {
    expect(sogManeuverAxisBounds(points(4), points(10))).toEqual({ minimum: 3, maximum: 11 })
    expect(sogManeuverAxisBounds(points(0))).toEqual({ minimum: 0, maximum: 3 })
    expect(sogManeuverAxisBounds([])).toEqual({ minimum: 0, maximum: 3 })
    expect(sogManeuverAxisBounds([{ time: 0, sog: null }])).toEqual({ minimum: 0, maximum: 3 })
  })

  it('maps values into a nonzero shared axis and breaks unsupported segments', () => {
    const path = buildSogManeuverPath([
      { time: -25_000, sog: 3 }, { time: 0, sog: null }, { time: 25_000, sog: 6 },
    ], { minimum: 3, maximum: 6 })
    expect(path).toBe('M0.00,192.00 M1000.00,8.00')
  })
})
