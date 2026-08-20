import { describe, expect, it } from 'vitest'
import { mockSessions } from './mockSessions'
import { demoComparisonActivityTrack } from './demoComparisonActivityTrack'
import { demoPrimaryActivityTrack } from './demoPrimaryActivityTrack'
import { buildTrackGeometry } from '../utils/trackGeometry'

const ACTIVITY_ID = '10000000-0000-4000-8000-000000000001'
const EXPECTED_SAMPLE_COUNT = 40_540
const EXPECTED_START = '2031-06-15T08:00:00Z'
const EXPECTED_END = '2031-06-16T05:15:13.001000Z'
const COMPARISON_ACTIVITY_ID = '10000000-0000-4000-8000-000000000002'
const COMPARISON_SAMPLE_COUNT = 14_769
const COMPARISON_START = '2031-06-15T08:23:04.031000Z'
const COMPARISON_END = '2031-06-15T10:26:08.019000Z'
const SESSION_ID = '20000000-0000-4000-8000-000000000001'

describe('complete public demo Activity fixtures', () => {
  it('matches the Activity identity and complete UTC range', () => {
    const activity = mockSessions
      .flatMap((session) => session.activities)
      .find((candidate) => candidate.activity_id === ACTIVITY_ID)

    expect(activity).toBeDefined()
    expect(demoPrimaryActivityTrack.activity_id).toBe(ACTIVITY_ID)
    expect(demoPrimaryActivityTrack.samples).toHaveLength(EXPECTED_SAMPLE_COUNT)
    expect(demoPrimaryActivityTrack.samples[0].utc).toBe(EXPECTED_START)
    expect(demoPrimaryActivityTrack.samples.at(-1)?.utc).toBe(EXPECTED_END)
    expect(demoPrimaryActivityTrack.samples[0].dist).toBe(0)
    expect(demoPrimaryActivityTrack.samples.at(-1)?.dist).toBe(0.17)
    expect(activity?.start_time).toBe(EXPECTED_START)
    expect(activity?.end_time).toBe(EXPECTED_END)
  })

  it('keeps all samples chronological with valid rendering coordinates', () => {
    let previousTime = -Infinity

    for (const trackSample of demoPrimaryActivityTrack.samples) {
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
    const { geoJson, bounds } = buildTrackGeometry(demoPrimaryActivityTrack.samples)

    expect(geoJson.geometry.coordinates).toHaveLength(EXPECTED_SAMPLE_COUNT)
    expect(geoJson.geometry.coordinates[0]).toEqual([-30.75, 0.25])
    expect(geoJson.geometry.coordinates.at(-1)).toEqual([-30.749882863, 0.250218618])
    expect(bounds).toEqual([
      [-30.750200728, 0.248991785],
      [-30.724468312, 0.258694939],
    ])
  })

  it('keeps the complete demo comparison Activity in the same Session', () => {
    const session = mockSessions.find((candidate) => (
      candidate.session_id === SESSION_ID
    ))
    const activity = session?.activities.find((candidate) => (
      candidate.activity_id === COMPARISON_ACTIVITY_ID
    ))

    expect(session?.activities.map((candidate) => candidate.activity_id))
      .toEqual([ACTIVITY_ID, COMPARISON_ACTIVITY_ID])
    expect(demoComparisonActivityTrack.activity_id).toBe(COMPARISON_ACTIVITY_ID)
    expect(demoComparisonActivityTrack.samples).toHaveLength(COMPARISON_SAMPLE_COUNT)
    expect(demoComparisonActivityTrack.samples[0].utc).toBe(COMPARISON_START)
    expect(demoComparisonActivityTrack.samples.at(-1)?.utc).toBe(COMPARISON_END)
    expect(activity?.start_time).toBe(COMPARISON_START)
    expect(activity?.end_time).toBe(COMPARISON_END)
  })

  it('preserves every comparison sample and its complete geometry', () => {
    let previousTime = -Infinity
    for (const trackSample of demoComparisonActivityTrack.samples) {
      const currentTime = Date.parse(trackSample.utc)
      expect(Number.isFinite(currentTime)).toBe(true)
      expect(currentTime).toBeGreaterThanOrEqual(previousTime)
      expect(Number.isFinite(trackSample.lat)).toBe(true)
      expect(Number.isFinite(trackSample.lon)).toBe(true)
      expect(Number.isFinite(trackSample.dist)).toBe(true)
      previousTime = currentTime
    }

    const { geoJson, bounds } = buildTrackGeometry(
      demoComparisonActivityTrack.samples,
    )
    expect(geoJson.geometry.coordinates).toHaveLength(COMPARISON_SAMPLE_COUNT)
    expect(geoJson.geometry.coordinates[0])
      .toEqual([-30.749876917, 0.249705173])
    expect(geoJson.geometry.coordinates.at(-1))
      .toEqual([-30.728265426, 0.255196042])
    expect(bounds).toEqual([
      [-30.750238172, 0.249238014],
      [-30.724505755, 0.258941168],
    ])
  })
})
