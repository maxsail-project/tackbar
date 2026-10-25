import { describe, expect, it } from 'vitest'
import type { SogChartPoint } from './metricChartData'
import { calculateCogManeuverInsights } from './maneuverCogInsights'

function curve(start = -6, end = 6, entry = -30, exit = 30): SogChartPoint[] {
  return Array.from({ length: 51 }, (_, index) => {
    const offset = index - 25
    const fraction = Math.max(0, Math.min(1, (offset - start) / (end - start)))
    return { time: offset * 1000, sog: entry + fraction * (exit - entry) }
  })
}

describe('COG maneuver insights from supported raw median', () => {
  it('uses supported entry/exit medians and interpolates a normal 10–90% turn', () => {
    const result = calculateCogManeuverInsights(curve())
    expect(result.turnAngleDeg).toBe(60)
    expect(result.turnStartSeconds).toBeCloseTo(-4.8)
    expect(result.turnMidpointSeconds).toBe(0)
    expect(result.turnEndSeconds).toBeCloseTo(4.8)
    expect(result.turnDurationSeconds).toBeCloseTo(9.6)
  })

  it('keeps an off-center turn midpoint and its actual start time', () => {
    const result = calculateCogManeuverInsights(curve(-8, 4))
    expect(result.turnMidpointSeconds).toBe(-2)
    expect(result.turnStartSeconds).toBeCloseTo(-6.8)
    expect(result.turnEndSeconds).toBeCloseTo(2.8)
  })

  it('keeps a supported zero crossing outside 10–90% for unequal entry and exit levels', () => {
    const earlyZero = calculateCogManeuverInsights(curve(-6, 6, -5, 95))
    expect(earlyZero.turnMidpointSeconds).toBeCloseTo(-5.4)
    expect(earlyZero.turnStartSeconds).toBeCloseTo(-4.8)
    const lateZero = calculateCogManeuverInsights(curve(-6, 6, -95, 5))
    expect(lateZero.turnMidpointSeconds).toBeCloseTo(5.4)
    expect(lateZero.turnEndSeconds).toBeCloseTo(4.8)
  })

  it('rejects an early two-second noise crossing that falls back before the main turn', () => {
    const noisy = curve()
    noisy[-13 + 25].sog = 1
    noisy[-12 + 25].sog = 1
    noisy[-11 + 25].sog = -30
    const result = calculateCogManeuverInsights(noisy)
    expect(result.turnStartSeconds).toBeCloseTo(-4.8)
    expect(result.turnMidpointSeconds).toBe(0)
    expect(result.turnEndSeconds).toBeCloseTo(4.8)
  })

  it('does not cross unsupported gaps or accept a one-second spike', () => {
    const gapped = curve()
    gapped[25].sog = null
    expect(calculateCogManeuverInsights(gapped)).toMatchObject({
      turnAngleDeg: 60, turnMidpointSeconds: null, turnDurationSeconds: null,
    })
    const spike = curve()
    spike[-13 + 25].sog = 1
    spike[-12 + 25].sog = -30
    expect(calculateCogManeuverInsights(spike).turnStartSeconds).toBeCloseTo(-4.8)
    const lateSpike = curve(-6, 12)
    lateSpike[1 + 25].sog = 30
    lateSpike[2 + 25].sog = -3.333333333333332
    expect(calculateCogManeuverInsights(lateSpike).turnEndSeconds).toBeCloseTo(10.2)
  })

  it('requires at least 8 of 11 supported seconds for both levels', () => {
    const eight = curve()
    for (const offset of [-25, -24, -23]) eight[offset + 25].sog = null
    expect(calculateCogManeuverInsights(eight).turnAngleDeg).toBe(60)
    eight[-22 + 25].sog = null
    expect(calculateCogManeuverInsights(eight).turnAngleDeg).toBeNull()
    const missingExit = curve()
    for (const offset of [22, 23, 24, 25]) missingExit[offset + 25].sog = null
    expect(calculateCogManeuverInsights(missingExit).turnAngleDeg).toBeNull()
  })

  it('leaves a curve without confirmed 90% progression unavailable for duration', () => {
    const incomplete = curve(-8, 20)
    expect(calculateCogManeuverInsights(incomplete).turnAngleDeg).toBeGreaterThan(0)
    expect(calculateCogManeuverInsights(incomplete).turnDurationSeconds).toBeNull()
  })

  it('excludes a 10% crossing on the -16s to -15s segment', () => {
    const result = calculateCogManeuverInsights(curve(-16, -12, -50, 50))
    expect(result).toMatchObject({
      turnAngleDeg: 100,
      turnStartSeconds: null,
      turnMidpointSeconds: null,
      turnEndSeconds: null,
      turnDurationSeconds: null,
    })
  })

  it('accepts crossings in the first valid segment and at the +15s endpoint', () => {
    const firstSegment = calculateCogManeuverInsights(curve(-15.2, -11.2, -50, 50))
    expect(firstSegment.turnStartSeconds).toBeCloseTo(-14.8)
    expect(firstSegment.turnMidpointSeconds).toBeCloseTo(-13.2)
    expect(firstSegment.turnDurationSeconds).toBeCloseTo(3.3)

    const firstEndpointCurve = curve(-15, -10, -50, 50)
    firstEndpointCurve[-14 + 25].sog = -40
    expect(calculateCogManeuverInsights(firstEndpointCurve).turnStartSeconds).toBe(-14)

    const upperEndpointCurve = curve(11, 16, -50, 50)
    upperEndpointCurve[15 + 25].sog = 40
    const upperEndpoint = calculateCogManeuverInsights(upperEndpointCurve)
    expect(upperEndpoint.turnEndSeconds).toBeCloseTo(15)
    expect(upperEndpoint.turnDurationSeconds).not.toBeNull()
    expect(calculateCogManeuverInsights(curve(11, 16, -50, 50)).turnDurationSeconds).toBeNull()
  })

  it('does not use a pre-window 0-degree crossing for an otherwise valid turn', () => {
    const earlyZero = curve(-15, -10, -5, 95)
    earlyZero[-15 + 25].sog = 1
    earlyZero[-14 + 25].sog = 10
    const result = calculateCogManeuverInsights(earlyZero)
    expect(result.turnAngleDeg).toBe(100)
    expect(result.turnStartSeconds).not.toBeNull()
    expect(result.turnDurationSeconds).not.toBeNull()
    expect(result.turnMidpointSeconds).toBeNull()
  })
})
