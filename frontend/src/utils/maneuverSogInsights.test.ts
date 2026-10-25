import { describe, expect, it } from 'vitest'
import type { SogChartPoint } from './metricChartData'
import { buildSogManeuverPath, calculateSogManeuverInsights, compareSogManeuverInsight, sogManeuverAxisBounds } from './maneuverSogInsights'

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
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: 5, minimumSog: 1.5, sogDrop: 3.5 })
  })

  it('requires 8 of 11 Entry offsets and takes the median of supported values only', () => {
    const curve = points(5)
    for (let index = 0; index < 11; index += 1) curve[index].sog = index + 1
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: 6, minimumSog: 5, sogDrop: 1 })

    for (let index = 0; index < 3; index += 1) curve[index].sog = null
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: 7.5, minimumSog: 5, sogDrop: 2.5 })

    curve[3].sog = null
    expect(calculateSogManeuverInsights(curve)).toEqual({ entrySog: null, minimumSog: 5, sogDrop: null })
  })

  it('preserves unsupported gaps and still requires every Minimum offset', () => {
    const entryGap = points(5)
    entryGap[5].sog = null
    expect(calculateSogManeuverInsights(entryGap)).toEqual({ entrySog: 5, minimumSog: 5, sogDrop: 0 })
    const minimumGap = points(5)
    minimumGap[35].sog = null
    expect(calculateSogManeuverInsights(minimumGap)).toEqual({ entrySog: 5, minimumSog: null, sogDrop: null })
  })

  it('retains signed negative drop and applies the inclusive 0.2 kt similarity threshold', () => {
    const curve = points(5)
    for (let index = 0; index <= 10; index += 1) curve[index].sog = 4
    expect(calculateSogManeuverInsights(curve).sogDrop).toBe(-1)
    expect(compareSogManeuverInsight('sogDrop', -1, 0.5)).toBe('No confirmed drop')
    expect(compareSogManeuverInsight('entrySog', 5, 5.2)).toBe('Similar')
    expect(compareSogManeuverInsight('minimumSog', 5, 5.201)).toBe('C higher')
    expect(compareSogManeuverInsight('sogDrop', 2, 2.3)).toBe('P smaller drop')
    expect(compareSogManeuverInsight('sogDrop', 2.3, 2)).toBe('C smaller drop')
    expect(compareSogManeuverInsight('entrySog', 5, null)).toBe('—')
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
