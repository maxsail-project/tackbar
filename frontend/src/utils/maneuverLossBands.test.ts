import { describe, expect, it } from 'vitest'
import { MANEUVER_LOSS_BAND_CONFIG } from '../config/maneuverLossBands'
import type { DisplayManeuver } from './maneuverEvents'
import { maneuverSelectionKey } from './maneuverEvents'
import {
  classifyManeuverLossTime,
  deriveManeuverLossBands,
  formatManeuverLossBand,
  interpolatedQuantile,
  MANEUVER_LOSS_BANDS,
  maneuverLossTimeSeconds,
  type ManeuverLossBand,
} from './maneuverLossBands'
import { maneuverAtMinute } from './maneuverTestFixtures'

let sequence = 0

function eventWithLoss(
  lossTimeS: number | null | undefined,
  activityRole: DisplayManeuver['activityRole'] = 'primary',
): DisplayManeuver {
  sequence += 1
  return maneuverAtMinute(sequence, activityRole, lossTimeS === undefined ? {} : { speed_loss_time_s: lossTimeS })
}

function bandsOf(events: DisplayManeuver[], bands: ReadonlyMap<string, ManeuverLossBand>) {
  return events.map((event) => bands.get(maneuverSelectionKey(event)) ?? null)
}

describe('maneuver loss band configuration (#211.2)', () => {
  it('uses quartile cut points and a minimum population of 8', () => {
    expect(MANEUVER_LOSS_BAND_CONFIG).toEqual({ lowQuantile: 0.25, highQuantile: 0.75, minPopulation: 8 })
  })
})

describe('interpolatedQuantile (type 7)', () => {
  it('interpolates linearly between floor and ceil of h = (n − 1)·q', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8]
    // h = 7 · 0.25 = 1.75 → 2 + 0.75 · (3 − 2)
    expect(interpolatedQuantile(sorted, 0.25)).toBeCloseTo(2.75, 12)
    // h = 7 · 0.75 = 5.25 → 6 + 0.25 · (7 − 6)
    expect(interpolatedQuantile(sorted, 0.75)).toBeCloseTo(6.25, 12)
    expect(interpolatedQuantile([1.5, 2, 4, 10], 0.5)).toBeCloseTo(3, 12)
  })

  it('returns exact values at integer positions and the extremes', () => {
    const sorted = [0, 10, 20, 30, 40]
    expect(interpolatedQuantile(sorted, 0.25)).toBe(10)
    expect(interpolatedQuantile(sorted, 0.75)).toBe(30)
    expect(interpolatedQuantile(sorted, 0)).toBe(0)
    expect(interpolatedQuantile(sorted, 1)).toBe(40)
    expect(interpolatedQuantile([7], 0.25)).toBe(7)
  })

  it('rejects an empty population', () => {
    expect(() => interpolatedQuantile([], 0.5)).toThrow(RangeError)
  })
})

describe('classifyManeuverLossTime', () => {
  it('is Low at or below the low cut, High at or above the high cut, otherwise Typical', () => {
    expect(classifyManeuverLossTime(2, 2.75, 6.25)).toBe('low')
    expect(classifyManeuverLossTime(2.75, 2.75, 6.25)).toBe('low')
    expect(classifyManeuverLossTime(2.76, 2.75, 6.25)).toBe('typical')
    expect(classifyManeuverLossTime(6.24, 2.75, 6.25)).toBe('typical')
    expect(classifyManeuverLossTime(6.25, 2.75, 6.25)).toBe('high')
    expect(classifyManeuverLossTime(9, 2.75, 6.25)).toBe('high')
  })

  it('is Typical for every value when the cut points are equal', () => {
    expect(classifyManeuverLossTime(1, 4, 4)).toBe('typical')
    expect(classifyManeuverLossTime(4, 4, 4)).toBe('typical')
    expect(classifyManeuverLossTime(9, 4, 4)).toBe('typical')
  })
})

describe('deriveManeuverLossBands', () => {
  it('bands the lowest quartile Low, the highest High and the rest Typical, keyed by selection key', () => {
    const events = [5, 1, 8, 3, 6, 2, 7, 4].map((loss) => eventWithLoss(loss))
    const bands = deriveManeuverLossBands(events)
    // Cuts 2.75 and 6.25 over 1…8.
    expect(bandsOf(events, bands)).toEqual(['typical', 'low', 'high', 'typical', 'typical', 'low', 'high', 'typical'])
    expect([...bands.keys()]).toEqual(expect.arrayContaining(events.map(maneuverSelectionKey)))
    expect(bands.size).toBe(8)
  })

  it('uses unrounded Loss time with interpolated cut points', () => {
    const events = [1.04, 1.06, 2, 2, 2, 2, 2.94, 2.96].map((loss) => eventWithLoss(loss))
    // h = 1.75 → 1.06 + 0.75 · 0.94 = 1.765; h = 5.25 → 2 + 0.25 · 0.94 = 2.235.
    expect(bandsOf(events, deriveManeuverLossBands(events)))
      .toEqual(['low', 'low', 'typical', 'typical', 'typical', 'typical', 'high', 'high'])
  })

  it('gives tied Loss times the same band', () => {
    const events = [1, 1, 1, 2, 3, 3, 3, 3].map((loss) => eventWithLoss(loss))
    // Cuts: h = 1.75 → 1; h = 5.25 → 3.
    expect(bandsOf(events, deriveManeuverLossBands(events)))
      .toEqual(['low', 'low', 'low', 'typical', 'high', 'high', 'high', 'high'])
  })

  it('makes every classified maneuver Typical without spread', () => {
    const allEqual = Array.from({ length: 9 }, () => eventWithLoss(4.2))
    expect(bandsOf(allEqual, deriveManeuverLossBands(allEqual))).toEqual(Array(9).fill('typical'))
    // Equal cut points despite one outlier.
    const nearlyEqual = [1, 1, 1, 1, 1, 1, 1, 9].map((loss) => eventWithLoss(loss))
    expect(bandsOf(nearlyEqual, deriveManeuverLossBands(nearlyEqual))).toEqual(Array(8).fill('typical'))
  })

  it('excludes null, missing and non-finite Loss times from the population and from classification', () => {
    const classified = [1, 2, 3, 4, 5, 6, 7].map((loss) => eventWithLoss(loss))
    const unclassified = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
      .map((loss) => eventWithLoss(loss))
    // Seven finite Loss times: below the minimum population even with twelve maneuvers listed.
    expect(deriveManeuverLossBands([...classified, ...unclassified]).size).toBe(0)
    const eighth = eventWithLoss(8)
    const bands = deriveManeuverLossBands([...classified, eighth, ...unclassified])
    expect(bands.size).toBe(8)
    expect(bandsOf(unclassified, bands)).toEqual([null, null, null, null, null])
    expect(maneuverLossTimeSeconds(unclassified[2])).toBeNull()
    expect(maneuverLossTimeSeconds(eighth)).toBe(8)
  })

  it('requires exactly the minimum population per Activity', () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((loss) => eventWithLoss(loss))
    expect(deriveManeuverLossBands(eight).size).toBe(8)
    expect(deriveManeuverLossBands(eight.slice(0, 7)).size).toBe(0)
    expect(deriveManeuverLossBands([]).size).toBe(0)
  })

  it('computes P and C independently and never pools them', () => {
    const primary = [1, 2, 3, 4, 5, 6, 7, 8].map((loss) => eventWithLoss(loss, 'primary'))
    const comparison = [11, 12, 13, 14, 15, 16, 17, 18].map((loss) => eventWithLoss(loss, 'comparison'))
    const bands = deriveManeuverLossBands([...comparison, ...primary])
    const expected = ['low', 'low', 'typical', 'typical', 'typical', 'typical', 'high', 'high']
    expect(bandsOf(primary, bands)).toEqual(expected)
    // Pooled, every C Loss time would sit at or above the pooled high cut.
    expect(bandsOf(comparison, bands)).toEqual(expected)
  })

  it('bands only the Activity that reaches the minimum population', () => {
    const primary = [1, 2, 3, 4, 5, 6, 7, 8].map((loss) => eventWithLoss(loss, 'primary'))
    const comparison = [1, 9, 20].map((loss) => eventWithLoss(loss, 'comparison'))
    const bands = deriveManeuverLossBands([...primary, ...comparison])
    expect(bandsOf(primary, bands).every((band) => band !== null)).toBe(true)
    expect(bandsOf(comparison, bands)).toEqual([null, null, null])
  })

  it('accepts a configuration override', () => {
    const events = [1, 2, 3, 4, 5].map((loss) => eventWithLoss(loss))
    expect(deriveManeuverLossBands(events).size).toBe(0)
    const bands = deriveManeuverLossBands(events, { lowQuantile: 0.1, highQuantile: 0.9, minPopulation: 5 })
    // Cuts: h = 0.4 → 1.4; h = 3.6 → 4.6.
    expect(bandsOf(events, bands)).toEqual(['low', 'typical', 'typical', 'typical', 'high'])
    const quartiles = deriveManeuverLossBands(events, { ...MANEUVER_LOSS_BAND_CONFIG, minPopulation: 5 })
    // Cuts: 2 and 4 exactly.
    expect(bandsOf(events, quartiles)).toEqual(['low', 'low', 'typical', 'high', 'high'])
  })
})

describe('loss band labels', () => {
  it('orders and labels bands High loss · Typical · Low loss', () => {
    expect(MANEUVER_LOSS_BANDS.map(formatManeuverLossBand)).toEqual(['High loss', 'Typical', 'Low loss'])
  })
})
