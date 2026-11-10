import { describe, expect, it } from 'vitest'
import type { SessionActivity } from '../types/session'
import { initialPrimaryActivityId } from './initialPrimaryActivity'

const base = Date.UTC(2026, 10, 2, 10)
function activity(id: string, startSeconds: number, endSeconds: number): SessionActivity {
  return {
    id,
    start_time: new Date(base + startSeconds * 1_000).toISOString(),
    end_time: new Date(base + endSeconds * 1_000).toISOString(),
    source: 'test', device_name: 'Device', original_filename: `${id}.gpx`, sample_count: 2,
    sailor: { name: id, display_label: `${id}@` }, boat: null,
  }
}

describe('initial Primary Activity ranking', () => {
  it('uses longer duration to resolve the equal pairwise score of two overlapping Activities', () => {
    const short = activity('short', 2, 8)
    const long = activity('long', 0, 10)
    expect(initialPrimaryActivityId([short, long])).toBe('long')
    expect(initialPrimaryActivityId([long, short])).toBe('long')
  })

  it('prefers accumulated pairwise overlap over a longer standalone Activity', () => {
    const long = activity('long', 0, 100)
    const cluster = [activity('center', 200, 220), activity('left', 200, 215), activity('right', 205, 220)]
    expect(initialPrimaryActivityId([long, ...cluster])).toBe('center')
    expect(initialPrimaryActivityId([...cluster].reverse().concat(long))).toBe('center')
  })

  it('sums separate overlaps with other Activities rather than taking the largest single overlap', () => {
    const activities = [
      activity('middle', 0, 20), activity('early', 0, 8),
      activity('late', 12, 20), activity('outer', 30, 100),
    ]
    expect(initialPrimaryActivityId(activities)).toBe('middle')
  })

  it('uses longest valid duration for disjoint and adjacent intervals, then ascending Activity ID', () => {
    expect(initialPrimaryActivityId([activity('short', 10, 20), activity('long', 20, 40)])).toBe('long')
    const equal = [activity('z', 0, 10), activity('a', 20, 30), activity('m', 40, 50)]
    expect(initialPrimaryActivityId(equal)).toBe('a')
    expect(initialPrimaryActivityId([...equal].reverse())).toBe('a')
  })

  it('returns one visible Activity or empty without depending on interval validity', () => {
    expect(initialPrimaryActivityId([])).toBe('')
    expect(initialPrimaryActivityId([activity('only', 10, 10)])).toBe('only')
  })

  it('gives malformed, reversed and nonpositive intervals zero score and duration', () => {
    const invalid = [
      { ...activity('z', 0, 10), start_time: 'bad timestamp' },
      activity('y', 10, 10),
      activity('x', 20, 10),
    ]
    expect(initialPrimaryActivityId([...invalid, activity('valid', 30, 31)])).toBe('valid')
    expect(initialPrimaryActivityId(invalid)).toBe('x')
    expect(initialPrimaryActivityId([...invalid].reverse())).toBe('x')
  })
})
