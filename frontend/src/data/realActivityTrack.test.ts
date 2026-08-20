import { describe, expect, it } from 'vitest'
import { mockSessions } from './mockSessions'
import { realComparisonActivityTrack } from './realComparisonActivityTrack'
import { realActivityTrack } from './realActivityTrack'
import { buildTrackGeometry } from '../utils/trackGeometry'

const ACTIVITY_ID = '8c36e153-5186-4ba3-b19f-cfa2636ec5cd'
const EXPECTED_SAMPLE_COUNT = 40_540
const EXPECTED_START = '2026-08-15T11:51:03.056000Z'
const EXPECTED_END = '2026-08-16T09:06:16.057000Z'
const COMPARISON_ACTIVITY_ID = '1ffdaa10-68b1-4770-90da-ec486326bcf2'
const COMPARISON_SAMPLE_COUNT = 14_769
const COMPARISON_START = '2026-08-15T12:14:07.087000Z'
const COMPARISON_END = '2026-08-15T14:17:11.075000Z'
const SESSION_ID = '00ef902a-d49d-44e2-9f4b-c3f258407b5f'

describe('complete real Activity fixture', () => {
  it('matches the Activity identity and complete UTC range', () => {
    const activity = mockSessions
      .flatMap((session) => session.activities)
      .find((candidate) => candidate.activity_id === ACTIVITY_ID)

    expect(activity).toBeDefined()
    expect(realActivityTrack.activity_id).toBe(ACTIVITY_ID)
    expect(realActivityTrack.samples).toHaveLength(EXPECTED_SAMPLE_COUNT)
    expect(realActivityTrack.samples[0].utc).toBe(EXPECTED_START)
    expect(realActivityTrack.samples.at(-1)?.utc).toBe(EXPECTED_END)
    expect(realActivityTrack.samples[0].dist).toBe(0)
    expect(realActivityTrack.samples.at(-1)?.dist).toBe(0.17)
    expect(activity?.start_time).toBe(EXPECTED_START)
    expect(activity?.end_time).toBe(EXPECTED_END)
  })

  it('keeps all samples chronological with valid rendering coordinates', () => {
    let previousTime = -Infinity

    for (const trackSample of realActivityTrack.samples) {
      const currentTime = Date.parse(trackSample.utc)
      expect(Number.isFinite(currentTime)).toBe(true)
      expect(currentTime).toBeGreaterThanOrEqual(previousTime)
      expect(Number.isFinite(trackSample.lat)).toBe(true)
      expect(Number.isFinite(trackSample.lon)).toBe(true)
      expect(Number.isFinite(trackSample.dist)).toBe(true)
      expect(trackSample.lat).toBeGreaterThanOrEqual(-90)
      expect(trackSample.lat).toBeLessThanOrEqual(90)
      expect(trackSample.lon).toBeGreaterThanOrEqual(-180)
      expect(trackSample.lon).toBeLessThanOrEqual(180)
      previousTime = currentTime
    }
  })

  it('builds one LineString coordinate per sample and complete bounds', () => {
    const { geoJson, bounds } = buildTrackGeometry(realActivityTrack.samples)

    expect(geoJson.geometry.coordinates).toHaveLength(EXPECTED_SAMPLE_COUNT)
    expect(geoJson.geometry.coordinates[0]).toEqual([-0.3290002, 39.4282267])
    expect(geoJson.geometry.coordinates.at(-1)).toEqual([-0.3286852, 39.4281786])
    expect(bounds).toEqual([
      [-0.3300904, 39.4058115],
      [-0.3092857, 39.4284513],
    ])
  })

  it('keeps the complete real comparison Activity in the same Session', () => {
    const session = mockSessions.find((candidate) => (
      candidate.session_id === SESSION_ID
    ))
    const activity = session?.activities.find((candidate) => (
      candidate.activity_id === COMPARISON_ACTIVITY_ID
    ))

    expect(session?.activities.map((candidate) => candidate.activity_id))
      .toEqual([ACTIVITY_ID, COMPARISON_ACTIVITY_ID])
    expect(realComparisonActivityTrack.activity_id).toBe(COMPARISON_ACTIVITY_ID)
    expect(realComparisonActivityTrack.samples).toHaveLength(COMPARISON_SAMPLE_COUNT)
    expect(realComparisonActivityTrack.samples[0].utc).toBe(COMPARISON_START)
    expect(realComparisonActivityTrack.samples.at(-1)?.utc).toBe(COMPARISON_END)
    expect(activity?.start_time).toBe(COMPARISON_START)
    expect(activity?.end_time).toBe(COMPARISON_END)
  })

  it('preserves every comparison sample and its complete geometry', () => {
    let previousTime = -Infinity
    for (const trackSample of realComparisonActivityTrack.samples) {
      const currentTime = Date.parse(trackSample.utc)
      expect(Number.isFinite(currentTime)).toBe(true)
      expect(currentTime).toBeGreaterThanOrEqual(previousTime)
      expect(Number.isFinite(trackSample.lat)).toBe(true)
      expect(Number.isFinite(trackSample.lon)).toBe(true)
      expect(Number.isFinite(trackSample.dist)).toBe(true)
      previousTime = currentTime
    }

    const { geoJson, bounds } = buildTrackGeometry(
      realComparisonActivityTrack.samples,
    )
    expect(geoJson.geometry.coordinates).toHaveLength(COMPARISON_SAMPLE_COUNT)
    expect(geoJson.geometry.coordinates[0])
      .toEqual([-0.329318626471827, 39.428022797341])
    expect(geoJson.geometry.coordinates.at(-1))
      .toEqual([-0.314340426471827, 39.408961197341])
    expect(bounds).toEqual([
      [-0.329799726471827, 39.405919297341],
      [-0.308995026471827, 39.428306597341],
    ])
  })
})
