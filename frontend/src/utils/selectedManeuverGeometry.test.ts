import { describe, expect, it } from 'vitest'
import type { ActivityTrack, TrackSample } from '../types/track'
import type { DisplayManeuver } from './maneuverEvents'
import { createSelectedManeuverHighlights } from './selectedManeuverGeometry'

const start = Date.UTC(2031, 0, 1, 10)
const window = { start, end: start + 60_000 }

function track(activityId: string, latitude: number): ActivityTrack {
  return {
    activity_id: activityId,
    samples: Array.from({ length: 61 }, (_, seconds): TrackSample => ({
      utc: new Date(start + seconds * 1_000).toISOString(),
      lat: latitude,
      lon: seconds / 1_000,
      dist: 0,
      sog: null,
      cog: null,
      hdg: null,
      heel: null,
      trim: null,
    })),
  }
}

function event(activityRole: DisplayManeuver['activityRole'], seconds: number): DisplayManeuver {
  return {
    activityRole,
    centerTimeMs: start + seconds * 1_000,
    maneuver: { center_time: new Date(start + seconds * 1_000).toISOString() } as DisplayManeuver['maneuver'],
  }
}

const primary = track('primary', 0.25)
const comparison = track('comparison', 0.28)

describe('selected maneuver trajectory geometry', () => {
  it('shows zero, one or two selections from their owning P/C tracks', () => {
    expect(createSelectedManeuverHighlights(null, null, primary, comparison, window)).toEqual([])
    const one = createSelectedManeuverHighlights(event('primary', 20), null, primary, comparison, window)
    expect(one).toHaveLength(1)
    expect(one[0].activityRole).toBe('primary')
    expect(one[0].selectionIndex).toBe(1)
    expect(one[0].geoJson.geometry.coordinates[0][0]).toEqual([0, 0.25])
    expect(one[0].geoJson.geometry.coordinates[0].at(-1)).toEqual([0.045, 0.25])

    const two = createSelectedManeuverHighlights(event('comparison', 20), event('primary', 10), primary, comparison, window)
    expect(two.map(({ selectionIndex, activityRole }) => [selectionIndex, activityRole])).toEqual([
      [1, 'comparison'], [2, 'primary'],
    ])
    expect(two[0].geoJson.geometry.coordinates[0].every((point) => point[1] === 0.28)).toBe(true)
    expect(two[1].geoJson.geometry.coordinates[0].every((point) => point[1] === 0.25)).toBe(true)
  })

  it('keeps two selections from the same Activity as separate highlights', () => {
    const highlights = createSelectedManeuverHighlights(event('primary', 20), event('primary', 10), primary, comparison, window)
    expect(highlights.map(({ selectionIndex, activityRole }) => [selectionIndex, activityRole])).toEqual([
      [1, 'primary'], [2, 'primary'],
    ])
    expect(highlights[0].geoJson.geometry.coordinates[0][0][0]).toBe(0)
    expect(highlights[1].geoJson.geometry.coordinates[0][0][0]).toBe(0)
    expect(highlights[0].geoJson.geometry.coordinates[0].at(-1)![0]).toBe(0.045)
    expect(highlights[1].geoJson.geometry.coordinates[0].at(-1)![0]).toBe(0.035)
  })

  it('uses exactly ±25 seconds and clips to the Analysis Window and available track evidence', () => {
    const [fullHighlight] = createSelectedManeuverHighlights(event('primary', 30), null, primary, null, window)
    const fullLine = fullHighlight.geoJson.geometry.coordinates[0]
    expect(fullLine[0][0]).toBe(0.005)
    expect(fullLine.at(-1)![0]).toBe(0.055)

    const narrowed = { start: start + 12_500, end: start + 29_500 }
    const [highlight] = createSelectedManeuverHighlights(event('primary', 20), null, primary, null, narrowed)
    const line = highlight.geoJson.geometry.coordinates[0]
    expect(line[0][0]).toBeCloseTo(0.0125)
    expect(line.at(-1)![0]).toBeCloseTo(0.0295)
    const shortTrack = { ...primary, samples: primary.samples.slice(10, 31) }
    const [shortHighlight] = createSelectedManeuverHighlights(event('primary', 20), null, shortTrack, null, window)
    expect(shortHighlight.geoJson.geometry.coordinates[0][0][0]).toBe(0.01)
    expect(shortHighlight.geoJson.geometry.coordinates[0].at(-1)![0]).toBe(0.03)
  })

  it('does not bridge missing, invalid or nonmonotonic sample evidence', () => {
    const gapped = { ...primary, samples: primary.samples.filter((_, index) => index < 18 || index > 22) }
    const [highlight] = createSelectedManeuverHighlights(event('primary', 20), null, gapped, null, window)
    expect(highlight.geoJson.geometry.coordinates).toHaveLength(2)
    expect(highlight.geoJson.geometry.coordinates[0].at(-1)![0]).toBe(0.017)
    expect(highlight.geoJson.geometry.coordinates[1][0][0]).toBe(0.023)

    const invalid = { ...primary, samples: primary.samples.map((sample, index) => index === 20 ? { ...sample, lat: Number.NaN } : sample) }
    const [invalidHighlight] = createSelectedManeuverHighlights(event('primary', 20), null, invalid, null, window)
    expect(invalidHighlight.geoJson.geometry.coordinates).toHaveLength(2)
    expect(invalidHighlight.geoJson.geometry.coordinates[0].at(-1)![0]).toBe(0.019)
    expect(invalidHighlight.geoJson.geometry.coordinates[1][0][0]).toBe(0.021)

    const reversed = { ...primary, samples: [...primary.samples] }
    reversed.samples[20] = { ...reversed.samples[20], utc: reversed.samples[19].utc }
    const [reversedHighlight] = createSelectedManeuverHighlights(event('primary', 20), null, reversed, null, window)
    expect(reversedHighlight.geoJson.geometry.coordinates).toHaveLength(2)
  })

  it('accepts a 1.5-second interval but leaves a longer interval unbridged', () => {
    const irregular = {
      ...primary,
      samples: [primary.samples[18], {
        ...primary.samples[20],
        utc: new Date(start + 19_500).toISOString(),
      }, {
        ...primary.samples[21],
        utc: new Date(start + 21_001).toISOString(),
      }],
    }
    const [highlight] = createSelectedManeuverHighlights(event('primary', 20), null, irregular, null, window)
    expect(highlight.geoJson.geometry.coordinates).toHaveLength(1)
    expect(highlight.geoJson.geometry.coordinates[0]).toHaveLength(2)
    expect(highlight.geoJson.geometry.coordinates[0][0][0]).toBe(0.018)
    expect(highlight.geoJson.geometry.coordinates[0][1][0]).toBe(0.02)
  })

  it('omits geometry without two supported points and does not use replay time', () => {
    expect(createSelectedManeuverHighlights(event('primary', 20), null, { ...primary, samples: [primary.samples[20]] }, null, window)).toEqual([])
    expect(createSelectedManeuverHighlights(event('comparison', 20), null, primary, null, window)).toEqual([])
    expect(createSelectedManeuverHighlights(event('primary', 20), null, primary, null, null)).toEqual([])
    const beforeReplay = createSelectedManeuverHighlights(event('primary', 20), null, primary, null, window)
    const afterReplay = createSelectedManeuverHighlights(event('primary', 20), null, primary, null, window)
    expect(afterReplay).toEqual(beforeReplay)
  })
})
