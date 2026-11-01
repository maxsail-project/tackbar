import { describe, expect, it } from 'vitest'
import {
  extractActivityStartCandidates,
  inferSessionStarts,
  SESSION_START_THRESHOLDS,
  type SessionTimerActivity,
} from './sessionStarts'

const BASE = Date.parse('2026-10-31T12:00:00.000Z')

function activity(id: string, events: [number, number][]): SessionTimerActivity {
  return {
    activity_id: id,
    race_timer_events: events.map(([offsetMs, event_type]) => ({
      timestamp: new Date(BASE + offsetMs).toISOString(),
      event_type,
    })),
  }
}

function times(activities: SessionTimerActivity[], thresholds?: Parameters<typeof inferSessionStarts>[1]): number[] {
  return inferSessionStarts(activities, thresholds).map((start) => start.time - BASE)
}

describe('Session Start inference', () => {
  it('reconstructs both real Atlas timer-zero cycles without RACE_END', () => {
    const source: SessionTimerActivity = { activity_id: 'atlas', race_timer_events: [
      { timestamp: '2026-10-31T12:23:13.060Z', event_type: 1 },
      { timestamp: '2026-10-31T12:24:04.824Z', event_type: 0 },
      { timestamp: '2026-10-31T12:26:27.935Z', event_type: 0 },
      { timestamp: '2026-10-31T12:28:09.671Z', event_type: 1 },
      { timestamp: '2026-10-31T12:34:09.689Z', event_type: 3 },
      { timestamp: '2026-10-31T13:04:18.181Z', event_type: 0 },
      { timestamp: '2026-10-31T13:06:55.148Z', event_type: 1 },
      { timestamp: '2026-10-31T13:12:55.160Z', event_type: 3 },
    ] }
    expect(inferSessionStarts([source]).map(({ label, time }) => [label, new Date(time).toISOString()])).toEqual([
      ['S01', '2026-10-31T12:34:09.689Z'],
      ['S02', '2026-10-31T13:12:55.160Z'],
    ])
  })

  it('uses a new timer START after timer zero to delimit cycles, retaining only each final zero', () => {
    const source = activity('A', [[0, 1], [1_000, 3], [2_000, 3], [3_000, 1], [4_000, 3], [5_000, 3]])
    expect(extractActivityStartCandidates(source).map(({ time }) => time - BASE)).toEqual([2_000, 5_000])
    expect(times([source])).toEqual([5_000]) // Distinct-start selection still applies.
  })

  it.each([
    [299_000, [299_000]],
    [300_000, [0, 300_000]],
    [301_000, [0, 301_000]],
  ])('separates undelimited timer-zero candidates at the %ims gap', (gap, expected) => {
    const source = activity('A', [[0, 3], [gap, 3]])
    expect(extractActivityStartCandidates(source).map(({ time }) => time - BASE)).toEqual(expected)
    expect(times([source])).toEqual(expected)
  })

  it('uses the latest timer-zero in each closed and open Activity period', () => {
    const source = activity('A', [
      [0, 1], [1_000, 3], [2_000, 3], [3_000, 4],
      [4_000, 4], [5_000, 3], [6_000, 2], [7_000, 3],
    ])
    expect(extractActivityStartCandidates(source).map(({ time }) => time - BASE)).toEqual([2_000, 7_000])
    expect(times([source])).toEqual([7_000]) // Same potential start inside five minutes.
  })

  it('stable-sorts equal UTC timestamps by source order, keeping repeated observations', () => {
    const source = activity('A', [
      [1_000, 3], [0, 4], [1_000, 4], [1_000, 3], [1_000, 3],
    ])
    expect(extractActivityStartCandidates(source).map(({ time, sourceIndex }) => [time - BASE, sourceIndex])).toEqual([
      [1_000, 0], [1_000, 4],
    ])
  })

  it('does not make candidates from END-only, VKX START, or unknown codes', () => {
    expect(inferSessionStarts([
      activity('A', [[0, 4], [1_000, 1], [2_000, 8], [3_000, 4]]),
      activity('B', []),
    ])).toEqual([])
  })

  it('handles missing and legacy empty event collections', () => {
    expect(inferSessionStarts([])).toEqual([])
    expect(inferSessionStarts([activity('A', []), activity('B', [])])).toEqual([])
  })

  it('uses every contributing Activity, keeps an inclusive tolerance edge, and computes a UTC median', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3]]),
      activity('B', [[1_001, 3]]),
      activity('C', [[3_000, 3]]),
      activity('D', [[10_000, 3]]),
    ])
    expect(starts).toEqual([{ label: 'S01', time: BASE + 1_001, activityIds: ['A', 'B', 'C'] }])
    expect(times([activity('A', [[0, 3]]), activity('B', [[3_001, 3]])])).toEqual([])
  })

  it('does not widen synchronization transitively through a chain', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3]]), activity('B', [[2_000, 3]]), activity('C', [[4_000, 3]]),
    ])
    expect(starts).toHaveLength(1)
    expect(starts[0].activityIds).toHaveLength(2)
    expect(starts[0].time).toBe(BASE + 3_000) // Equal support favors later median.
  })

  it.each([
    [2_000, 2_000, 1_000],
    [3_000, 3_000, 1_500],
    [5_000, 5_000, 2_500],
  ])('allows injected %ims tolerance, including its exact edge', (toleranceMs, separationMs, expectedMedian) => {
    expect(times([
      activity('A', [[0, 3]]), activity('B', [[separationMs, 3]]),
    ], { synchronizationToleranceMs: toleranceMs })).toEqual([expectedMedian])
    expect(times([
      activity('A', [[0, 3]]), activity('B', [[separationMs + 1, 3]]),
    ], { synchronizationToleranceMs: toleranceMs })).toEqual([])
  })

  it('keeps millisecond precision, including a two-source median between milliseconds', () => {
    expect(times([
      activity('A', [[123, 3]]), activity('B', [[124, 3]]),
    ])).toEqual([123.5])
  })

  it('does not promote isolated later outliers when multiple Activities contribute candidates', () => {
    expect(times([
      activity('A', [[0, 3]]), activity('B', [[1_000, 3]]), activity('C', [[14_000, 3]]),
    ])).toEqual([500])
    expect(times([
      activity('A', [[0, 3]]), activity('B', [[14_000, 3]]),
    ])).toEqual([])
  })

  it('uses one candidate per Activity per group, including overlapping repeated periods', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3], [1, 4], [2, 3]]),
      activity('B', [[1, 3]]),
      activity('C', [[2, 3]]),
    ])
    expect(starts).toEqual([{ label: 'S01', time: BASE + 2, activityIds: ['A', 'B', 'C'] }])
  })

  it('keeps separate multi-device Starts across a long Session and numbers them chronologically', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3], [1_000, 4], [600_000, 3]]),
      activity('B', [[1_000, 3], [2_000, 4], [601_000, 3]]),
      activity('C', [[602_000, 3]]),
      activity('D', [[1_000, 3]]),
    ])
    expect(starts.map(({ label, time, activityIds }) => [label, time - BASE, activityIds])).toEqual([
      ['S01', 1_000, ['A', 'B', 'D']],
      ['S02', 601_000, ['A', 'B', 'C']],
    ])
  })

  it.each([
    [299_000, [299_000]],
    [300_000, [0, 300_000]],
    [301_000, [0, 301_000]],
  ])('applies the %ims single-source start gap', (gap, expected) => {
    expect(times([activity('A', [[0, 3], [1_000, 4], [gap, 3]])])).toEqual(expected)
  })

  it.each([
    [299_000, [299_000]],
    [300_000, [0, 300_000]],
    [301_000, [0, 301_000]],
  ])('applies the %ims gap to multi-Activity medians', (gap, expected) => {
    expect(times([
      activity('A', [[0, 3], [1, 4], [gap, 3]]),
      activity('B', [[0, 3], [1, 4], [gap, 3]]),
    ])).toEqual(expected)
  })

  it('selects greatest distinct support, then the later median, without a global winner', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3], [1_000, 4], [100_000, 3], [101_000, 4], [600_000, 3]]),
      activity('B', [[1_000, 3], [2_000, 4], [101_000, 3], [102_000, 4], [601_000, 3]]),
      activity('C', [[0, 3], [1_000, 4], [602_000, 3]]),
    ])
    expect(starts.map((start) => [start.label, start.time - BASE, start.activityIds.length])).toEqual([
      ['S01', 0, 3],
      ['S02', 601_000, 3],
    ])
  })

  it('does not let one group suppress a whole transitive five-minute chain', () => {
    expect(times([activity('A', [[0, 3], [1, 4], [299_000, 3], [299_001, 4], [598_000, 3]])])).toEqual([
      0, 598_000,
    ])
  })

  it('scales support to a larger fleet without a fixed two-out-of-three quorum', () => {
    const fleet = Array.from({ length: 12 }, (_, index) =>
      activity(`A${String(index).padStart(2, '0')}`, [[index % 3 * 500, 3]]),
    )
    expect(inferSessionStarts(fleet)).toEqual([{
      label: 'S01', time: BASE + 500, activityIds: fleet.map(({ activity_id }) => activity_id),
    }])
  })

  it('keeps centralized defaults at three seconds and five minutes', () => {
    expect(SESSION_START_THRESHOLDS).toEqual({ synchronizationToleranceMs: 3_000, distinctStartGapMs: 300_000 })
  })
})
