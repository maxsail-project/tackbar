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
    line_positions: [],
  }
}

function times(activities: SessionTimerActivity[], thresholds?: Parameters<typeof inferSessionStarts>[1]): number[] {
  return inferSessionStarts(activities, thresholds).map((start) => start.time - BASE)
}

describe('Session Start inference', () => {
  it('infers both Atlas timer-zero Starts with or without other timer events', () => {
    const source: SessionTimerActivity = { activity_id: 'atlas', line_positions: [], race_timer_events: [
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
      ['S1', '2026-10-31T12:34:09.689Z'],
      ['S2', '2026-10-31T13:12:55.160Z'],
    ])
    expect(inferSessionStarts([{
      ...source,
      race_timer_events: source.race_timer_events.filter((event) => event.event_type === 3),
    }])).toEqual(inferSessionStarts([source]))
  })

  it('does not let timer START or RACE_END create, end or suppress candidates', () => {
    const source = activity('A', [[0, 1], [1_000, 3], [2_000, 3], [3_000, 4], [4_000, 3], [5_000, 1], [6_000, 3]])
    expect(extractActivityStartCandidates(source).map(({ time }) => time - BASE)).toEqual([1_000, 2_000, 4_000, 6_000])
    expect(times([source])).toEqual(times([activity('A', [[1_000, 3], [2_000, 3], [4_000, 3], [6_000, 3]])]))
  })

  it('stable-sorts equal UTC timestamps by source order, keeping repeated observations', () => {
    const source = activity('A', [
      [1_000, 3], [0, 4], [1_000, 4], [1_000, 3], [1_000, 3],
    ])
    expect(extractActivityStartCandidates(source).map(({ time, sourceIndex }) => [time - BASE, sourceIndex])).toEqual([
      [1_000, 0], [1_000, 3], [1_000, 4],
    ])
  })

  it('does not make candidates from non-zero timer types or invalid timestamps', () => {
    expect(inferSessionStarts([
      activity('A', [[0, 4], [1_000, 1], [2_000, 8], [3_000, 4]]),
      activity('B', []),
    ])).toEqual([])
    expect(extractActivityStartCandidates({ activity_id: 'A', race_timer_events: [
      { timestamp: 'invalid', event_type: 3 }, { timestamp: new Date(BASE).toISOString(), event_type: 3 },
    ] })).toEqual([{ activityId: 'A', time: BASE, sourceIndex: 1 }])
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
    expect(starts).toEqual([{ label: 'S1', time: BASE + 1_001, activityIds: ['A', 'B', 'C'] }])
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

  it('uses one candidate per Activity per group, including repeated timer zeros', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3], [2, 3]]),
      activity('B', [[1, 3]]),
      activity('C', [[2, 3]]),
    ])
    expect(starts).toEqual([{ label: 'S1', time: BASE + 2, activityIds: ['A', 'B', 'C'] }])
  })

  it('keeps separate multi-device Starts across a long Session and numbers them chronologically', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3], [600_000, 3]]),
      activity('B', [[1_000, 3], [601_000, 3]]),
      activity('C', [[602_000, 3]]),
      activity('D', [[1_000, 3]]),
    ])
    expect(starts.map(({ label, time, activityIds }) => [label, time - BASE, activityIds])).toEqual([
      ['S1', 1_000, ['A', 'B', 'D']],
      ['S2', 601_000, ['A', 'B', 'C']],
    ])
  })

  it.each([
    [299_000, [299_000]],
    [300_000, [0, 300_000]],
    [301_000, [0, 301_000]],
  ])('applies the %ims single-source start gap', (gap, expected) => {
    expect(extractActivityStartCandidates(activity('A', [[0, 3], [gap, 3]])).map(({ time }) => time - BASE)).toEqual([0, gap])
    expect(times([activity('A', [[0, 3], [gap, 3]])])).toEqual(expected)
  })

  it('accepts an injected distinct-start gap without changing Activity candidates', () => {
    const source = activity('A', [[0, 3], [10_000, 3]])
    expect(extractActivityStartCandidates(source)).toHaveLength(2)
    expect(times([source], { distinctStartGapMs: 10_000 })).toEqual([0, 10_000])
  })

  it.each([
    [299_000, [299_000]],
    [300_000, [0, 300_000]],
    [301_000, [0, 301_000]],
  ])('applies the %ims gap to multi-Activity medians', (gap, expected) => {
    expect(times([
      activity('A', [[0, 3], [gap, 3]]),
      activity('B', [[0, 3], [gap, 3]]),
    ])).toEqual(expected)
  })

  it('selects greatest distinct support, then the later median, without a global winner', () => {
    const starts = inferSessionStarts([
      activity('A', [[0, 3], [100_000, 3], [600_000, 3]]),
      activity('B', [[1_000, 3], [101_000, 3], [601_000, 3]]),
      activity('C', [[0, 3], [602_000, 3]]),
    ])
    expect(starts.map((start) => [start.label, start.time - BASE, start.activityIds.length])).toEqual([
      ['S1', 0, 3],
      ['S2', 601_000, 3],
    ])
  })

  it('does not let one group suppress a whole transitive five-minute chain', () => {
    expect(times([activity('A', [[0, 3], [299_000, 3], [598_000, 3]])])).toEqual([
      0, 598_000,
    ])
  })

  it('scales support to a larger fleet without a fixed two-out-of-three quorum', () => {
    const fleet = Array.from({ length: 12 }, (_, index) =>
      activity(`A${String(index).padStart(2, '0')}`, [[index % 3 * 500, 3]]),
    )
    expect(inferSessionStarts(fleet)).toEqual([{
      label: 'S1', time: BASE + 500, activityIds: fleet.map(({ activity_id }) => activity_id),
    }])
  })

  it('keeps centralized defaults at three seconds and five minutes', () => {
    expect(SESSION_START_THRESHOLDS).toEqual({ synchronizationToleranceMs: 3_000, distinctStartGapMs: 300_000 })
  })
})
