import { describe, expect, it } from 'vitest'
import type { HistoricalConditions, HistoricalConditionsSample } from '../types/session'
import type { TrackSample } from '../types/track'
import type { DisplayManeuver } from './maneuverEvents'
import { maneuverSelectionKey } from './maneuverEvents'
import { displayManeuverAt } from './maneuverTestFixtures'
import {
  classifyManeuverWindSector,
  deriveManeuverWindSectors,
  formatManeuverSectorFilterFull,
  formatManeuverSectorFilterShort,
  formatManeuverWindSector,
  formatManeuverWindSectorFull,
  maneuverMatchesSectorFilter,
  type ManeuverWindSector,
} from './maneuverWindSector'
import { createTwdTimeResolver } from './twdReference'
import { createSegmentTwdAtTime } from './windSegments'

const origin = Date.parse('2026-10-25T12:00:00Z')
const utc = (second: number) => new Date(origin + second * 1000).toISOString()
const window = { start: origin, end: origin + 60_000 }

const sample = (second: number, cog: number | null, sog: number | null = 5): TrackSample => ({
  utc: utc(second), lat: 0, lon: 0, dist: 0, sog, cog, hdg: null, heel: null, trim: null,
})
/** 1 Hz COG trace: `pre` before second 32 and `post` from second 32, covering both contexts. */
const trace = (pre: number | null, post: number | null) => Array.from(
  { length: 26 },
  (_, index) => sample(index + 20, index + 20 < 32 ? pre : post),
)

function displayManeuver(
  activityRole: DisplayManeuver['activityRole'] = 'primary',
  centerSecond = 32,
): DisplayManeuver {
  return displayManeuverAt(origin + centerSecond * 1000, activityRole, {
    start_time: utc(30),
    end_time: utc(35),
    heading_change_deg: 90,
  })
}

function weatherSample(time: string, direction: number): HistoricalConditionsSample {
  return {
    time,
    wind_direction_10m_deg: direction,
    air_temperature_c: null,
    wind_speed_10m_kn: null,
    wind_gusts_10m_kn: null,
    cloud_cover_pct: null,
    wave_height_m: null,
    wave_direction_deg: null,
    wave_period_s: null,
  }
}

const references = (entryDeg: number, exitDeg: number) => ({
  entryDeg,
  exitDeg,
  signedChangeDeg: ((exitDeg - entryDeg + 540) % 360) - 180,
})

describe('classifyManeuverWindSector', () => {
  it('shows one sector when entry and exit share it, across the 0°/360° boundary', () => {
    expect(classifyManeuverWindSector(references(10, 350), 0)).toEqual({ kind: 'single', sector: 'upwind' })
    expect(classifyManeuverWindSector(references(5, 345), 355)).toEqual({ kind: 'single', sector: 'upwind' })
    expect(classifyManeuverWindSector(references(270, 90), 0)).toEqual({ kind: 'single', sector: 'reaching' })
    expect(classifyManeuverWindSector(references(170, 190), 0)).toEqual({ kind: 'single', sector: 'downwind' })
    expect(classifyManeuverWindSector(references(175, 185), 359)).toEqual({ kind: 'single', sector: 'downwind' })
  })

  it('shows a transition for any pair of different sectors', () => {
    expect(classifyManeuverWindSector(references(30, 180), 0)).toEqual({ kind: 'transition', entry: 'upwind', exit: 'downwind' })
    expect(classifyManeuverWindSector(references(180, 30), 0)).toEqual({ kind: 'transition', entry: 'downwind', exit: 'upwind' })
    expect(classifyManeuverWindSector(references(30, 90), 0)).toEqual({ kind: 'transition', entry: 'upwind', exit: 'reaching' })
    expect(classifyManeuverWindSector(references(90, 160), 0)).toEqual({ kind: 'transition', entry: 'reaching', exit: 'downwind' })
  })

  it('uses the existing 70° and 120° thresholds: reaching inclusive, upwind and downwind strict', () => {
    // TWD 0°: |TWA| equals the course offset from north.
    expect(classifyManeuverWindSector(references(69.9, 69.9), 0)).toEqual({ kind: 'single', sector: 'upwind' })
    expect(classifyManeuverWindSector(references(70, 70), 0)).toEqual({ kind: 'single', sector: 'reaching' })
    expect(classifyManeuverWindSector(references(120, 120), 0)).toEqual({ kind: 'single', sector: 'reaching' })
    expect(classifyManeuverWindSector(references(120.1, 120.1), 0)).toEqual({ kind: 'single', sector: 'downwind' })
    // Thresholds across the 0°/360° boundary: TWD 350° and course 60° give |TWA| = 70°.
    expect(classifyManeuverWindSector(references(60, 59.9), 350)).toEqual({ kind: 'transition', entry: 'reaching', exit: 'upwind' })
    // TWD 40° and course 330° give TWA +70° (reaching); course 330.1° gives +69.9° (upwind).
    expect(classifyManeuverWindSector(references(330, 330.1), 40)).toEqual({ kind: 'transition', entry: 'reaching', exit: 'upwind' })
  })

  it('yields no sector without references or a finite TWD', () => {
    expect(classifyManeuverWindSector(null, 0)).toBeNull()
    expect(classifyManeuverWindSector(references(10, 20), null)).toBeNull()
    expect(classifyManeuverWindSector(references(10, 20), Number.NaN)).toBeNull()
    expect(classifyManeuverWindSector({ entryDeg: Number.NaN, exitDeg: 20, signedChangeDeg: 0 }, 0)).toBeNull()
  })
})

describe('maneuver sector labels and filter matching', () => {
  const up: ManeuverWindSector = { kind: 'single', sector: 'upwind' }
  const reach: ManeuverWindSector = { kind: 'single', sector: 'reaching' }
  const down: ManeuverWindSector = { kind: 'single', sector: 'downwind' }
  const upDown: ManeuverWindSector = { kind: 'transition', entry: 'upwind', exit: 'downwind' }

  it('formats short and full labels without tack or gybe wording', () => {
    expect([up, reach, down, upDown, null, undefined].map(formatManeuverWindSector))
      .toEqual(['Up', 'Reach', 'Down', 'Up→Down', '—', '—'])
    expect([up, reach, down, upDown].map(formatManeuverWindSectorFull))
      .toEqual(['Upwind', 'Reaching', 'Downwind', 'Upwind to Downwind'])
    expect(formatManeuverWindSector({ kind: 'transition', entry: 'reaching', exit: 'upwind' })).toBe('Reach→Up')
    const filters = ['all', 'upwind', 'reaching', 'downwind', 'transition'] as const
    expect(filters.map(formatManeuverSectorFilterShort)).toEqual(['All', 'Up', 'Reach', 'Down', 'Transition'])
    expect(filters.map(formatManeuverSectorFilterFull)).toEqual(['All', 'Upwind', 'Reaching', 'Downwind', 'Transition'])
    const allLabels = [up, reach, down, upDown].flatMap((sector) => [
      formatManeuverWindSector(sector), formatManeuverWindSectorFull(sector),
    ]).join(' ')
    expect(allLabels).not.toMatch(/tack|gybe|jibe/i)
  })

  it('lists unavailable sectors only under All and every different pair under Transition', () => {
    expect(maneuverMatchesSectorFilter(null, 'all')).toBe(true)
    expect(maneuverMatchesSectorFilter(undefined, 'upwind')).toBe(false)
    expect(maneuverMatchesSectorFilter(null, 'transition')).toBe(false)
    expect(maneuverMatchesSectorFilter(up, 'upwind')).toBe(true)
    expect(maneuverMatchesSectorFilter(up, 'reaching')).toBe(false)
    expect(maneuverMatchesSectorFilter(up, 'transition')).toBe(false)
    expect(maneuverMatchesSectorFilter(upDown, 'transition')).toBe(true)
    expect(maneuverMatchesSectorFilter(upDown, 'upwind')).toBe(false)
    expect(maneuverMatchesSectorFilter(upDown, 'downwind')).toBe(false)
  })
})

describe('deriveManeuverWindSectors', () => {
  it('is null without a TWD reference, so no column values and no filter', () => {
    const event = displayManeuver()
    expect(deriveManeuverWindSectors([event], { primary: trace(10, 350), comparison: [] }, window, null)).toBeNull()
    expect(createSegmentTwdAtTime(createTwdTimeResolver(null), null)).toBeNull()
  })

  it('classifies contextual entry/exit references of each maneuver own Activity track', () => {
    const primary = displayManeuver('primary')
    const comparison = displayManeuver('comparison')
    const sectors = deriveManeuverWindSectors(
      [primary, comparison],
      { primary: trace(355, 5), comparison: trace(30, 180) },
      window,
      () => 0,
    )!
    expect(sectors.get(maneuverSelectionKey(primary))).toEqual({ kind: 'single', sector: 'upwind' })
    expect(sectors.get(maneuverSelectionKey(comparison))).toEqual({ kind: 'transition', entry: 'upwind', exit: 'downwind' })
  })

  it('omits maneuvers without contextual references, leaving them unavailable', () => {
    const event = displayManeuver()
    const sectors = deriveManeuverWindSectors([event], { primary: trace(null, null), comparison: [] }, window, () => 0)!
    expect(sectors.size).toBe(0)
    // Course evidence is clipped to the Analysis Window: no entry context inside it means no sector.
    const clipped = deriveManeuverWindSectors(
      [event], { primary: trace(10, 20), comparison: [] }, { start: origin + 29_000, end: origin + 60_000 }, () => 0,
    )!
    expect(clipped.size).toBe(0)
  })

  it('uses the nearest modelled TWD at the maneuver center time, with the earlier-sample tie rule', () => {
    const conditions: HistoricalConditions = {
      weather_source: { provider: 'open-meteo' },
      marine_source: null,
      hourly: [weatherSample(utc(0), 0), weatherSample(utc(60), 180)],
    }
    const twdAtTime = createSegmentTwdAtTime(createTwdTimeResolver(conditions), null)
    // Center 32 s is nearer the 180° sample; the start time (30 s) would tie and pick 0°.
    const atCenter = displayManeuver('primary', 32)
    // Center exactly between both samples resolves to the earlier one (0°).
    const atTie = displayManeuver('comparison', 30)
    const sectors = deriveManeuverWindSectors(
      [atCenter, atTie],
      { primary: trace(0, 10), comparison: trace(0, 10) },
      window,
      twdAtTime,
    )!
    expect(sectors.get(maneuverSelectionKey(atCenter))).toEqual({ kind: 'single', sector: 'downwind' })
    expect(sectors.get(maneuverSelectionKey(atTie))).toEqual({ kind: 'single', sector: 'upwind' })
  })

  it('uses an active Manual · Viewer value instead of the modelled direction', () => {
    const conditions: HistoricalConditions = {
      weather_source: { provider: 'open-meteo' },
      marine_source: null,
      hourly: [weatherSample(utc(0), 0)],
    }
    const event = displayManeuver()
    const samples = { primary: trace(0, 10), comparison: [] }
    const modelled = deriveManeuverWindSectors([event], samples, window, createSegmentTwdAtTime(createTwdTimeResolver(conditions), null))!
    const manual = deriveManeuverWindSectors([event], samples, window, createSegmentTwdAtTime(createTwdTimeResolver(conditions), 90))!
    const manualOnly = deriveManeuverWindSectors([event], samples, window, createSegmentTwdAtTime(null, 185))!
    expect(modelled.get(maneuverSelectionKey(event))).toEqual({ kind: 'single', sector: 'upwind' })
    expect(manual.get(maneuverSelectionKey(event))).toEqual({ kind: 'single', sector: 'reaching' })
    expect(manualOnly.get(maneuverSelectionKey(event))).toEqual({ kind: 'single', sector: 'downwind' })
  })

  it('returns an empty map without an Analysis Window', () => {
    expect(deriveManeuverWindSectors([displayManeuver()], { primary: trace(0, 10), comparison: [] }, null, () => 0)!.size).toBe(0)
  })
})
