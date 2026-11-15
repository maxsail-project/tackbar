import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import {
  calculateTackAxis,
  calculateWindContext,
  circularMeanOfTwo,
  classifyUpwindTack,
  classifyWindSector,
  evaluateHeelCheck,
  formatTwdSource,
  normalizeSignedDegrees,
  resolveEffectiveTwd,
  resolveTackAxisHint,
  resolveTackCheckLabels,
  signedTwaDegrees,
  type EffectiveTwd,
  type TackAxis,
} from './windContext'

const start = Date.UTC(2031, 5, 15, 11)
const modelled = (degrees: number): EffectiveTwd => ({ degrees, source: 'modelled' })

type SensorInput = { [K in Exclude<keyof TrackSample, 'cog'>]?: TrackSample[K] }
type SampleInput = { cog: number | null } & SensorInput

/** One sample per second; each sample represents one second of the window except the last. */
function samples(values: SampleInput[], stepSeconds = 1): TrackSample[] {
  return values.map((value, index) => ({
    utc: new Date(start + index * stepSeconds * 1_000).toISOString(),
    lat: 0, lon: 0, dist: 0,
    sog: 5, hdg: null, heel: null, trim: null,
    ...value,
  }))
}

function repeat(count: number, value: SampleInput) {
  return Array.from({ length: count }, () => value)
}

function windowFor(list: TrackSample[]) {
  return { start, end: Date.parse(list[list.length - 1].utc) }
}

describe('circular TWA', () => {
  it('wraps across 0°/360° (TWD 005° vs COG 350°)', () => {
    expect(signedTwaDegrees(5, 350)).toBe(15)
    expect(signedTwaDegrees(350, 5)).toBe(-15)
    expect(signedTwaDegrees(0, 315)).toBe(45)
    expect(signedTwaDegrees(360, 45)).toBe(-45)
    expect(signedTwaDegrees(725, -10)).toBe(15)
  })

  it('normalizes to (-180°, 180°] and rejects missing or non-finite course', () => {
    expect(normalizeSignedDegrees(180)).toBe(180)
    expect(normalizeSignedDegrees(-180)).toBe(180)
    expect(normalizeSignedDegrees(181)).toBe(-179)
    expect(signedTwaDegrees(90, null)).toBeNull()
    expect(signedTwaDegrees(90, Number.NaN)).toBeNull()
    expect(signedTwaDegrees(Number.POSITIVE_INFINITY, 10)).toBeNull()
  })

  it('places sector boundaries exactly at 70° and 120° in reaching', () => {
    expect(classifyWindSector(69.999)).toBe('upwind')
    expect(classifyWindSector(70)).toBe('reaching')
    expect(classifyWindSector(-70)).toBe('reaching')
    expect(classifyWindSector(120)).toBe('reaching')
    expect(classifyWindSector(-120.001)).toBe('downwind')
    expect(classifyWindSector(180)).toBe('downwind')
  })

  it('uses starboard for positive TWD − COG, port for negative and an indeterminate band below 15°', () => {
    expect(classifyUpwindTack(45)).toBe('starboard')
    expect(classifyUpwindTack(-45)).toBe('port')
    expect(classifyUpwindTack(15)).toBe('starboard')
    expect(classifyUpwindTack(-15)).toBe('port')
    expect(classifyUpwindTack(14.9)).toBe('indeterminate')
    expect(classifyUpwindTack(-14.9)).toBe('indeterminate')
    expect(classifyUpwindTack(0)).toBe('indeterminate')
  })
})

describe('effective TWD', () => {
  const reference = {
    status: 'available' as const, directionDegrees: 91.6, sourceKind: 'modelled_weather' as const,
    sourceTimeUtc: new Date(start).toISOString(), provenance: { provider: 'open-meteo' },
  }

  it('uses the original unrounded modelled direction or the manual value', () => {
    expect(resolveEffectiveTwd(reference, null)).toEqual({ degrees: 91.6, source: 'modelled' })
    expect(resolveEffectiveTwd(reference, 95)).toEqual({ degrees: 95, source: 'manual' })
    expect(resolveEffectiveTwd({ status: 'unavailable' }, 355)).toEqual({ degrees: 355, source: 'manual' })
    expect(resolveEffectiveTwd({ status: 'unavailable' }, null)).toBeNull()
    expect(formatTwdSource('modelled')).toBe('Modelled')
    expect(formatTwdSource('manual')).toBe('Manual · Viewer')
  })

  it('classifies with the unrounded value rather than the 5° presentation', () => {
    // COG 21.6 vs TWD 91.6 → |TWA| 70 (reaching); a rounded 90 would make it 68.4 (upwind).
    const list = samples(repeat(11, { cog: 21.6 }))
    const automatic = calculateWindContext(list, windowFor(list), resolveEffectiveTwd(reference, null))
    expect(automatic.classification).toBe('reaching')
    const manual = calculateWindContext(list, windowFor(list), resolveEffectiveTwd(reference, 90))
    expect(manual.classification).toBe('upwind')
  })
})

describe('window classification', () => {
  it('is unavailable without effective TWD, window or valid moving samples', () => {
    const list = samples(repeat(11, { cog: 45 }))
    expect(calculateWindContext(list, windowFor(list), null).classification).toBe('unavailable')
    expect(calculateWindContext(list, null, modelled(0)).classification).toBe('unavailable')
    const slow = samples(repeat(11, { cog: 45, sog: 1.49 }))
    expect(calculateWindContext(slow, windowFor(slow), modelled(0))).toEqual({
      classification: 'unavailable', movingSeconds: 0, sectorShares: null, upwindTack: null,
    })
    const noCog = samples(repeat(11, { cog: null }))
    expect(calculateWindContext(noCog, windowFor(noCog), modelled(0)).classification).toBe('unavailable')
  })

  it('counts moving time only at SOG ≥ 1.5 kn and excludes missing/non-finite COG and SOG', () => {
    const list = samples([
      ...repeat(4, { cog: 45 }),
      { cog: 45, sog: 1.5 },
      { cog: 45, sog: 1.4 },
      { cog: Number.NaN },
      { cog: 45, sog: null },
      { cog: 180, sog: Number.POSITIVE_INFINITY },
      { cog: 180 },
      { cog: 180 },
    ])
    const result = calculateWindContext(list, windowFor(list), modelled(0))
    expect(result.movingSeconds).toBe(6)
    expect(result.sectorShares).toEqual({ upwind: 5 / 6, reaching: 0, downwind: 1 / 6 })
    expect(result.classification).toBe('upwind')
  })

  it('needs ≥ 70% for a dominant sector and otherwise reports Mixed', () => {
    const atThreshold = samples([...repeat(7, { cog: 180 }), ...repeat(3, { cog: 90 }), { cog: 90 }])
    expect(calculateWindContext(atThreshold, windowFor(atThreshold), modelled(0)).classification).toBe('downwind')
    const below = samples([...repeat(69, { cog: 180 }), ...repeat(31, { cog: 90 }), { cog: 90 }])
    const result = calculateWindContext(below, windowFor(below), modelled(0))
    expect(result.sectorShares!.downwind).toBeCloseTo(0.69)
    expect(result.classification).toBe('mixed')
    expect(result.upwindTack).toBeNull()
  })

  it('does not bridge gaps over 10 s or nonpositive intervals, and stays inside the window', () => {
    const list = samples(repeat(6, { cog: 45 }))
    list[3] = { ...list[3], utc: new Date(start + 30_000).toISOString() }
    list[4] = { ...list[4], utc: new Date(start + 31_000).toISOString() }
    list[5] = { ...list[5], utc: new Date(start + 31_000).toISOString(), cog: 180 }
    const result = calculateWindContext(list, { start, end: start + 31_000 }, modelled(0))
    // 0→1, 1→2 count; 2→30 s gap excluded; 30→31 counts; 31→31 nonpositive.
    expect(result.movingSeconds).toBe(3)
    const clipped = calculateWindContext(list, { start: start + 1_500, end: start + 30_500 }, modelled(0))
    // Sample at 2 s (in window) is followed by a gap; sample at 30 s is clipped to 0.5 s.
    expect(clipped.movingSeconds).toBe(0.5)
  })

  it('accepts sparse LOW-style cadence up to the gap limit', () => {
    const list = samples(repeat(5, { cog: 180 }), 5)
    const result = calculateWindContext(list, windowFor(list), modelled(0))
    expect(result.movingSeconds).toBe(20)
    expect(result.classification).toBe('downwind')
    expect(result.upwindTack).toBeNull()
  })
})

describe('upwind tack split', () => {
  it('reports shares and mean |TWA| per tack with the indeterminate band', () => {
    const list = samples([
      ...repeat(4, { cog: 315 }), // TWA +45 starboard
      ...repeat(2, { cog: 320 }), // TWA +40 starboard
      ...repeat(3, { cog: 50 }), // TWA −50 port
      { cog: 10 }, // TWA −10 indeterminate
      { cog: 10 },
    ])
    const result = calculateWindContext(list, windowFor(list), modelled(0))
    expect(result.classification).toBe('upwind')
    const tack = result.upwindTack!
    expect(tack.upwindSeconds).toBe(10)
    expect(tack.shares).toEqual({ starboard: 0.6, port: 0.3, indeterminate: 0.1 })
    expect(tack.meanAbsTwaDegrees.starboard).toBeCloseTo(130 / 3)
    expect(tack.meanAbsTwaDegrees.port).toBe(50)
    expect(tack.check.labels).toEqual(['COG only'])
  })

  it('handles tacks across the 0°/360° wind boundary', () => {
    // TWD 005°: COG 320 → +45 starboard, COG 050 → −45 port.
    const list = samples([...repeat(5, { cog: 320 }), ...repeat(5, { cog: 50 }), { cog: 50 }])
    const tack = calculateWindContext(list, windowFor(list), modelled(5)).upwindTack!
    expect(tack.shares.starboard).toBe(0.5)
    expect(tack.shares.port).toBe(0.5)
    expect(tack.meanAbsTwaDegrees.starboard).toBe(45)
    expect(tack.meanAbsTwaDegrees.port).toBe(45)
  })

  it('shows no tack split for downwind or reaching windows', () => {
    const downwind = samples(repeat(11, { cog: 160, hdg: 160, heel: 5 }))
    expect(calculateWindContext(downwind, windowFor(downwind), modelled(0)).upwindTack).toBeNull()
    const reaching = samples(repeat(11, { cog: 90 }))
    expect(calculateWindContext(reaching, windowFor(reaching), modelled(0)).upwindTack).toBeNull()
  })

  it('recomputes the tack grouping when the effective TWD changes', () => {
    const list = samples([...repeat(5, { cog: 315 }), ...repeat(5, { cog: 45 }), { cog: 45 }])
    expect(calculateWindContext(list, windowFor(list), modelled(0)).upwindTack!.shares.starboard).toBe(0.5)
    const manual = calculateWindContext(list, windowFor(list), { degrees: 330, source: 'manual' })
    // TWD 330: COG 315 → +15 starboard, COG 45 → −75 reaching (excluded from upwind).
    expect(manual.sectorShares!.upwind).toBe(0.5)
    expect(manual.classification).toBe('mixed')
    expect(manual.upwindTack).toBeNull()
  })
})

describe('tack consistency checks', () => {
  const tacks = (port: SensorInput, starboard: SensorInput) => samples([
    ...repeat(5, { cog: 315, ...starboard }),
    ...repeat(5, { cog: 45, ...port }),
    { cog: 45 },
  ])
  const check = (list: TrackSample[]) => calculateWindContext(list, windowFor(list), modelled(0)).upwindTack!.check

  it('confirms with HDG when HDG-based TWA signs agree with the COG grouping', () => {
    // Leeway: HDG a few degrees higher than COG keeps the same sign.
    expect(check(tacks({ hdg: 40 }, { hdg: 320 }))).toEqual({ hdg: 'agree', heel: 'unavailable', labels: ['HDG ✓'] })
  })

  it('marks HDG disagreement as ? without changing the COG tack result', () => {
    const list = tacks({ hdg: 300 }, { hdg: 60 })
    const result = calculateWindContext(list, windowFor(list), modelled(0)).upwindTack!
    expect(result.check).toEqual({ hdg: 'disagree', heel: 'unavailable', labels: ['?'] })
    expect(result.shares).toEqual({ starboard: 0.5, port: 0.5, indeterminate: 0 })
  })

  it('confirms with HEEL only by sign opposition between tack groups, regardless of absolute sign', () => {
    expect(check(tacks({ heel: 8 }, { heel: -9 })).labels).toEqual(['HEEL ✓'])
    expect(check(tacks({ heel: -8 }, { heel: 9 })).labels).toEqual(['HEEL ✓'])
  })

  it('marks same-sign HEEL as ? and weak HEEL as not conclusive', () => {
    expect(check(tacks({ heel: 8 }, { heel: 9 }))).toEqual({ hdg: 'unavailable', heel: 'same', labels: ['?'] })
    expect(check(tacks({ heel: 2.9 }, { heel: -9 }))).toEqual({ hdg: 'unavailable', heel: 'weak', labels: ['COG only'] })
    expect(evaluateHeelCheck({ port: [[3, 1]], starboard: [[-3, 1]] })).toBe('opposite')
  })

  it('requires both tack groups for HEEL and reports COG only without HDG/HEEL', () => {
    const oneTack = samples([...repeat(10, { cog: 315, heel: -8, hdg: 318 }), { cog: 315 }])
    expect(check(oneTack)).toEqual({ hdg: 'agree', heel: 'unavailable', labels: ['HDG ✓'] })
    expect(check(tacks({ heel: null, hdg: null }, { heel: Number.NaN, hdg: Number.NaN })).labels).toEqual(['COG only'])
  })

  it('combines both passing checks and lets any inconsistent check win', () => {
    expect(check(tacks({ hdg: 40, heel: 8 }, { hdg: 320, heel: -8 })).labels).toEqual(['HDG ✓', 'HEEL ✓'])
    expect(resolveTackCheckLabels('agree', 'same')).toEqual(['?'])
    expect(resolveTackCheckLabels('disagree', 'opposite')).toEqual(['?'])
    expect(resolveTackCheckLabels('unavailable', 'weak')).toEqual(['COG only'])
  })

  it('uses time-weighted medians per group', () => {
    const list = samples([
      ...repeat(4, { cog: 315, heel: -8 }),
      { cog: 315, heel: 6 },
      ...repeat(5, { cog: 45, heel: 7 }),
      { cog: 45 },
    ])
    expect(check(list).heel).toBe('opposite')
  })
})

describe('window end', () => {
  it('counts the last in-window sample interval clipped at the window end from the full track', () => {
    const list = samples(repeat(21, { cog: 180 }))
    const window = { start, end: start + 10_500 }
    expect(calculateWindContext(list, window, modelled(0)).movingSeconds).toBe(10.5)
    // Window-only samples lose the final partial interval.
    expect(calculateWindContext(list.slice(0, 11), window, modelled(0)).movingSeconds).toBe(10)
  })

  it('keeps samples starting before the window start excluded', () => {
    const list = samples(repeat(21, { cog: 180 }))
    expect(calculateWindContext(list, { start: start + 500, end: start + 10_000 }, modelled(0)).movingSeconds).toBe(9)
  })
})

describe('tack axis and tack angle', () => {
  /** Starboard and port legs at constant COG, `seconds` of represented time each. */
  function legs(starboardCog: number, portCog: number, seconds = 61, extra: Partial<Record<'starboard' | 'port', SensorInput>> = {}) {
    return samples([
      ...repeat(seconds, { cog: starboardCog, ...extra.starboard }),
      ...repeat(seconds, { cog: portCog, ...extra.port }),
      { cog: portCog },
    ])
  }
  const axisFor = (list: TrackSample[], twd: number) =>
    calculateWindContext(list, windowFor(list), modelled(twd)).upwindTack!.axis

  it('computes the 015° / 33° / 45° example: Axis 021° (+6), Tack angle 78°', () => {
    // TWD 015°: starboard COG 342° → |TWA| 33°, port COG 060° → |TWA| 45°.
    const axis = axisFor(legs(342, 60), 15)!
    expect(axis.degrees).toBeCloseTo(21)
    expect(axis.offsetDegrees).toBeCloseTo(6)
    expect(axis.tackAngleDegrees).toBeCloseTo(78)
  })

  it('normalizes across 0°/360° with effective TWD 355°', () => {
    // Starboard COG 322° → 33°, port COG 040° → 45° → Axis 001°, +6.
    const axis = axisFor(legs(322, 40), 355)!
    expect(axis.degrees).toBeCloseTo(1)
    expect(axis.offsetDegrees).toBeCloseTo(6)
    const negative = axisFor(legs(318, 30), 5)!
    // Starboard 47°, port 25° → Axis 354° (−11).
    expect(negative.degrees).toBeCloseTo(354)
    expect(negative.offsetDegrees).toBeCloseTo(-11)
  })

  it('is invariant when effective TWD is moved near the axis', () => {
    const list = legs(342, 60)
    const near = axisFor(list, 21)!
    expect(near.degrees).toBeCloseTo(21)
    expect(near.offsetDegrees).toBeCloseTo(0)
    expect(near.tackAngleDegrees).toBeCloseTo(78)
    expect(axisFor(list, 18)!.degrees).toBeCloseTo(21)
    const wrapped = legs(322, 40)
    expect(axisFor(wrapped, 1)!.degrees).toBeCloseTo(1)
    expect(axisFor(wrapped, 358)!.degrees).toBeCloseTo(1)
  })

  it('is unavailable with less than 60 s on one tack', () => {
    const list = samples([...repeat(61, { cog: 342 }), ...repeat(59, { cog: 60 }), { cog: 60 }])
    const tack = calculateWindContext(list, windowFor(list), modelled(15)).upwindTack!
    expect(tack.tackSeconds.port).toBe(59)
    expect(tack.axis).toBeNull()
    const exactly = samples([...repeat(60, { cog: 342 }), ...repeat(60, { cog: 60 }), { cog: 60 }])
    expect(axisFor(exactly, 15)).not.toBeNull()
  })

  it('is unavailable when the tack check is ?', () => {
    const list = legs(342, 60, 61, { starboard: { hdg: 60 }, port: { hdg: 342 } })
    const tack = calculateWindContext(list, windowFor(list), modelled(15)).upwindTack!
    expect(tack.check.labels).toEqual(['?'])
    expect(tack.axis).toBeNull()
    expect(axisFor(legs(342, 60, 61, { starboard: { hdg: 345 }, port: { hdg: 57 } }), 15)).not.toBeNull()
  })

  it('is absent for non-upwind windows and requires both tack means', () => {
    const downwind = samples(repeat(200, { cog: 195 }))
    expect(calculateWindContext(downwind, windowFor(downwind), modelled(15)).upwindTack).toBeNull()
    expect(calculateTackAxis(15, {
      tackSeconds: { port: 0, starboard: 120, indeterminate: 0 },
      meanAbsTwaDegrees: { port: null, starboard: 33 },
      check: { hdg: 'unavailable', heel: 'unavailable', labels: ['COG only'] },
    })).toBeNull()
  })
})

describe('combined tack axis hint', () => {
  const axis = (degrees: number, twd: number): TackAxis => ({
    degrees, offsetDegrees: normalizeSignedDegrees(degrees - twd), tackAngleDegrees: 80,
  })

  it('shows the circular mean when P and C agree within 5° and differ from TWD by ≥ 3°', () => {
    const hint = resolveTackAxisHint(15, axis(21, 15), true, axis(24, 15))!
    expect(hint.degrees).toBeCloseTo(22.5)
    expect(hint.offsetDegrees).toBeCloseTo(7.5)
    expect(hint.combined).toBe(true)
    expect(resolveTackAxisHint(15, axis(21, 15), true, axis(26, 15))).not.toBeNull()
  })

  it('hides on disagreement, small offset or a missing C axis', () => {
    expect(resolveTackAxisHint(15, axis(21, 15), true, axis(26.5, 15))).toBeNull()
    expect(resolveTackAxisHint(15, axis(16, 15), true, axis(19, 15))).toBeNull()
    expect(resolveTackAxisHint(15, axis(21, 15), true, null)).toBeNull()
    expect(resolveTackAxisHint(15, null, true, axis(21, 15))).toBeNull()
  })

  it('uses the P axis alone without Comparison', () => {
    expect(resolveTackAxisHint(15, axis(21, 15), false, null)).toEqual({ degrees: 21, offsetDegrees: 6, combined: false })
    expect(resolveTackAxisHint(15, axis(12, 15), false, null)!.offsetDegrees).toBe(-3)
    expect(resolveTackAxisHint(15, axis(17.9, 15), false, null)).toBeNull()
  })

  it('averages axes circularly across 0°', () => {
    expect(circularMeanOfTwo(358, 2)).toBeCloseTo(0)
    expect(circularMeanOfTwo(2, 358)).toBeCloseTo(0)
    expect(circularMeanOfTwo(357, 1)).toBeCloseTo(359)
    const hint = resolveTackAxisHint(350, axis(358, 350), true, axis(2, 350))!
    expect(hint.degrees).toBeCloseTo(0)
    expect(hint.offsetDegrees).toBeCloseTo(10)
  })
})
