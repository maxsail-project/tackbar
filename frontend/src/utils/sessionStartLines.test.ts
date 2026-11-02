import { describe, expect, it } from 'vitest'
import type { SessionTimerActivity } from './sessionStarts'
import { inferSessionStartLines, SESSION_START_LINE_THRESHOLDS, visibleDeduplicatedSessionStartLines } from './sessionStartLines'

const start = { label: 'S1', time: Date.parse('2031-01-01T12:00:00Z'), activityIds: ['A', 'B'] }
function activity(activity_id: string, line_positions: SessionTimerActivity['line_positions']): SessionTimerActivity {
  return { activity_id, race_timer_events: [], line_positions }
}
function obs(seconds: number, endpoint_type: 0 | 1, latitude: number, longitude: number) {
  return { timestamp: new Date(start.time + seconds * 1000).toISOString(), endpoint_type, latitude, longitude }
}

describe('ephemeral Session start lines', () => {
  it('selects each latest at-or-before endpoint independently, supports missing endpoints and keeps recorded coordinates', () => {
    const inferred = inferSessionStartLines([start, { ...start, label: 'S2', time: start.time + 60_000 }], [
      activity('A', [obs(-120, 0, 0, 0), obs(-60, 0, 0, 0.00001), obs(-30, 1, 0, 0.001), obs(1, 1, 50, 50)]),
      activity('B', [obs(-90, 1, 0.000001, 0.00101)]),
    ])
    expect(inferred[0].pin).toEqual({ latitude: 0, longitude: 0.00001 })
    expect(inferred[0].boat).toEqual({ latitude: 0.000001, longitude: 0.00101 })
    expect(inferred[1].pin).toEqual(inferred[0].pin)
    expect(inferred[1].label).toBe('S2')
  })

  it('uses centralized metre and circular-bearing thresholds and retains distinct visual configurations', () => {
    expect(SESSION_START_LINE_THRESHOLDS).toEqual({ endpointToleranceMeters: 3, equivalentBearingDegrees: 10 })
    const lines = inferSessionStartLines([
      start,
      { ...start, label: 'S2', time: start.time + 1 },
      { ...start, label: 'S3', time: start.time + 2 },
    ], [
      activity('A', [obs(-1, 0, 0, 0), obs(-1, 1, 0, 0.001)]),
      activity('B', [obs(-1, 0, 0.000001, 0), obs(-1, 1, 0.000001, 0.001)]),
    ])
    expect(visibleDeduplicatedSessionStartLines(lines, { start: start.time + 1, end: start.time + 2 }).map((line) => line.label)).toEqual(['S2'])
    expect(visibleDeduplicatedSessionStartLines(lines, { start: start.time, end: start.time }).map((line) => line.label)).toEqual(['S1'])
  })
})
