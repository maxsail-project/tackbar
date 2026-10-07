import { describe, expect, it } from 'vitest'
import type { ActivityManeuverAnalytics, Maneuver } from '../types/maneuver'
import { timestampToMilliseconds } from './replay'
import {
  deriveDisplayManeuvers,
  formatHeadingChange,
  formatKnots,
  formatMetres,
  formatSeconds,
  maneuverSelectionKey,
  retainDisplayedManeuverSelection,
} from './maneuverEvents'

const windowStart = timestampToMilliseconds('2031-06-15T08:00:00Z')
const windowEnd = timestampToMilliseconds('2031-06-15T08:10:00Z')

function maneuver(
  centerTime: string,
  headingChange = 84,
  startTime = centerTime,
  endTime = centerTime,
): Maneuver {
  return {
    start_time: startTime,
    center_time: centerTime,
    end_time: endTime,
    heading_change_deg: headingChange,
    peak_turn_rate_deg_s: 12,
    peak_turn_rate_time: centerTime,
    duration_s: 0,
    sog_entry_kn: null,
    sog_min_kn: null,
    sog_exit_kn: null,
    recovery_time_s: null,
    speed_loss_distance_m: null,
    speed_loss_time_s: null,
  }
}

function available(maneuvers: Maneuver[]): ActivityManeuverAnalytics {
  return { activity_id: 'activity', status: 'available', maneuvers }
}

describe('maneuver event derivation', () => {
  it('filters inclusively by center_time at both Analysis Window boundaries', () => {
    const result = deriveDisplayManeuvers(
      available([
        maneuver('2031-06-15T07:59:59Z'),
        maneuver('2031-06-15T08:00:00Z'),
        maneuver('2031-06-15T08:10:00Z'),
        maneuver('2031-06-15T08:10:01Z'),
      ]),
      null,
      { start: windowStart, end: windowEnd },
    )

    expect(result.map((event) => event.maneuver.center_time)).toEqual([
      '2031-06-15T08:00:00Z',
      '2031-06-15T08:10:00Z',
    ])
  })

  it('excludes an overlapping event whose center_time is outside the window', () => {
    const result = deriveDisplayManeuvers(
      available([
        maneuver(
          '2031-06-15T07:59:59Z',
          84,
          '2031-06-15T07:59:50Z',
          '2031-06-15T08:00:10Z',
        ),
      ]),
      null,
      { start: windowStart, end: windowEnd },
    )

    expect(result).toEqual([])
  })

  it('merges P and C chronologically and orders P first at equal timestamps', () => {
    const result = deriveDisplayManeuvers(
      available([
        maneuver('2031-06-15T08:05:00Z'),
        maneuver('2031-06-15T08:07:00Z'),
      ]),
      available([
        maneuver('2031-06-15T08:03:00Z'),
        maneuver('2031-06-15T08:05:00Z'),
      ]),
      { start: windowStart, end: windowEnd },
    )

    expect(result.map((event) => [
      event.maneuver.center_time,
      event.activityRole,
    ])).toEqual([
      ['2031-06-15T08:03:00Z', 'comparison'],
      ['2031-06-15T08:05:00Z', 'primary'],
      ['2031-06-15T08:05:00Z', 'comparison'],
      ['2031-06-15T08:07:00Z', 'primary'],
    ])
  })

  it('returns no events for empty or unavailable analytics', () => {
    const unavailable: ActivityManeuverAnalytics = {
      activity_id: 'primary',
      status: 'unavailable',
      reason: 'missing_hdg',
      maneuvers: [],
    }

    expect(deriveDisplayManeuvers(
      unavailable,
      available([]),
      { start: windowStart, end: windowEnd },
    )).toEqual([])
  })
})

describe('maneuver heading-change presentation', () => {
  it.each([
    [83.6, '+84'],
    [-90.6, '−91'],
    [-0.1, '+0'],
  ])('formats %s compactly as %s', (value, expected) => {
    expect(formatHeadingChange(value)).toBe(expected)
  })
})

describe('maneuver debrief metric presentation', () => {
  it('formats compact units and unavailable values', () => {
    expect(formatSeconds(12.4)).toBe('12')
    expect(formatKnots(5.24)).toBe('5.2')
    expect(formatMetres(8.6)).toBe('9')
    expect(formatSeconds(null)).toBe('—')
    expect(formatKnots(undefined)).toBe('—')
    expect(formatMetres(null)).toBe('—')
  })
})

describe('explicit maneuver selection identity', () => {
  it('distinguishes roles and event boundaries instead of using center time alone', () => {
    const primary = maneuver('2031-06-15T08:05:00Z')
    const shiftedStart = {
      ...primary,
      start_time: '2031-06-15T08:04:59Z',
    }

    expect(maneuverSelectionKey({
      activityRole: 'primary',
      maneuver: primary,
      centerTimeMs: timestampToMilliseconds(primary.center_time),
    })).not.toBe(maneuverSelectionKey({
      activityRole: 'comparison',
      maneuver: primary,
      centerTimeMs: timestampToMilliseconds(primary.center_time),
    }))
    expect(maneuverSelectionKey({
      activityRole: 'primary',
      maneuver: primary,
      centerTimeMs: timestampToMilliseconds(primary.center_time),
    })).not.toBe(maneuverSelectionKey({
      activityRole: 'primary',
      maneuver: shiftedStart,
      centerTimeMs: timestampToMilliseconds(shiftedStart.center_time),
    }))
  })

  it('retains selection only while its event remains displayed', () => {
    const first = deriveDisplayManeuvers(
      available([maneuver('2031-06-15T08:05:00Z')]),
      null,
      { start: windowStart, end: windowEnd },
    )[0]
    const second = deriveDisplayManeuvers(
      available([maneuver('2031-06-15T08:07:00Z')]),
      null,
      { start: windowStart, end: windowEnd },
    )[0]
    const selected = maneuverSelectionKey(first)

    expect(retainDisplayedManeuverSelection(selected, [first, second])).toBe(selected)
    expect(retainDisplayedManeuverSelection(selected, [second])).toBeNull()
    expect(retainDisplayedManeuverSelection(selected, [])).toBeNull()
    expect(retainDisplayedManeuverSelection(null, [first])).toBeNull()
  })
})
