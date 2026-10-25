import { describe, expect, it } from 'vitest'
import type { SogChartPoint } from './metricChartData'
import { calculateHeelManeuverInsights, heelManeuverAxisBounds } from './maneuverHeelInsights'

function curve(entry: number, central: number, exit: number): SogChartPoint[] {
  return Array.from({ length: 51 }, (_, index) => {
    const offset = index - 25
    return { time: offset * 1000, sog: offset <= -15 ? entry : offset >= 15 ? exit : central }
  })
}

describe('HEEL insights from supported raw |HEEL| median', () => {
  it('reports positive, negative and zero central median variation without changing sign semantics', () => {
    expect(calculateHeelManeuverInsights(curve(4, 8, 6))).toEqual({
      entryHeel: 4, heelVariation: 4, exitHeel: 6,
    })
    expect(calculateHeelManeuverInsights(curve(8, 4, 6)).heelVariation).toBe(-4)
    expect(calculateHeelManeuverInsights(curve(6, 6, 6)).heelVariation).toBe(0)
  })

  it('uses the central median rather than a transient peak', () => {
    const points = curve(4, 6, 5)
    points[25].sog = 30
    expect(calculateHeelManeuverInsights(points).heelVariation).toBe(2)
  })

  it('requires 8 of 11 supported entry and exit offsets and uses only supported values', () => {
    const points = curve(4, 8, 6)
    for (const offset of [-25, -24, -23]) points[offset + 25].sog = null
    points[-22 + 25].sog = 12
    expect(calculateHeelManeuverInsights(points)).toMatchObject({ entryHeel: 4, heelVariation: 4 })
    points[-21 + 25].sog = null
    expect(calculateHeelManeuverInsights(points)).toMatchObject({ entryHeel: null, heelVariation: null })
    const exit = curve(4, 8, 6)
    for (const offset of [15, 16, 17, 18]) exit[offset + 25].sog = null
    expect(calculateHeelManeuverInsights(exit).exitHeel).toBeNull()
  })

  it('requires all 21 central offsets and never fills unsupported gaps', () => {
    const missing = curve(4, 8, 6)
    missing[25].sog = null
    expect(calculateHeelManeuverInsights(missing)).toEqual({ entryHeel: 4, heelVariation: null, exitHeel: 6 })
    const nonfinite = curve(4, 8, 6)
    nonfinite[25].sog = Number.NaN
    expect(calculateHeelManeuverInsights(nonfinite).heelVariation).toBeNull()
  })

  it('uses one zero-based shared axis with an upper bound above all visible values', () => {
    expect(heelManeuverAxisBounds(curve(4, 8, 6), curve(10, 14, 12))).toEqual({ minimum: 0, maximum: 15 })
    expect(heelManeuverAxisBounds(curve(0, 0, 0))).toEqual({ minimum: 0, maximum: 3 })
    expect(heelManeuverAxisBounds([], [])).toEqual({ minimum: 0, maximum: 3 })
  })
})
