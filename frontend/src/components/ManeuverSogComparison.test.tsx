/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import { angleRangeKeyboard, moveAngleBand, pointerAngleDegrees, updateAngleGesture } from './ManeuverAngleRange'
import ManeuverSogComparison, { supportedSogPoints } from './ManeuverSogComparison'
import { aggregatePreparedSogPopulation, prepareSogManeuverPopulation, type PreparedSogPopulation } from '../utils/typicalSogProfile'
import * as rawProfiles from '../utils/maneuverProfiles'

function population(count: number, course = 60): PreparedSogPopulation {
  return {
    detectedCount: count,
    windowEligibleCount: count,
    missingCourseCount: 0,
    maneuvers: Array.from({ length: count }, (_, index) => ({
      courseChangeDeg: course,
      nominalCoverage: 1,
      grid: Array.from({ length: 51 }, (_, offset) => offset === 25 && index === 0 ? null : index + 3),
    })),
  }
}

describe('maneuver SOG comparison', () => {
  it('supports inclusive angular limits and only draws offsets with three contributors', () => {
    const prepared = population(3, 40)
    prepared.maneuvers[1].courseChangeDeg = 100
    prepared.maneuvers[2].courseChangeDeg = 60
    const selected = aggregatePreparedSogPopulation(prepared, 40, 100)
    expect(selected.angularBandSelectedCount).toBe(3)
    expect(selected.coverageEligibleCount).toBe(3)
    expect(selected.grid[25].contributorCount).toBe(2)
    expect(selected.grid[25].medianSogKn).toBe(4.5)
    expect(supportedSogPoints(selected)[25].sog).toBeNull()
    expect(supportedSogPoints(selected)[24].sog).toBe(4)
    expect(aggregatePreparedSogPopulation(prepared, 45, 95).status).toBe('insufficient_maneuvers')
  })

  it('renders independent P/C curves, counts, and a visible t=0 reference', () => {
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population(3)} comparison={population(4)} />)
    expect(html).toContain('Typical SOG maneuver comparison')
    expect(html).toContain('40°–100°')
    expect(html).toContain('data-maneuver-center="true"')
    expect(html).toContain('data-profile-series="primary-raw"')
    expect(html).toContain('data-profile-series="comparison-smoothed"')
    expect(html).toContain('3 in window')
    expect(html).toContain('4 in window')
    expect(html).toContain('3 used')
    expect(html).toContain('SOG Maneuver Insights')
    expect(html).toContain('Entry SOG')
    expect(html).toContain('Minimum SOG')
    expect(html).toContain('Exit SOG')
    expect(html).toContain('Profile recovery')
    expect(html).not.toContain('SOG drop')
    expect(html).not.toContain('detected')
    expect(html).toContain('t=0')
  })

  it('renders one compact three-column comparison table at every width', () => {
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population(3)} comparison={population(4)} />)
    const insights = html.match(/<section class="maneuver-insights"[\s\S]*?<\/section>/)?.[0]
    expect(insights).toBeDefined()
    expect(insights).toContain('<table class="maneuver-insights__table">')
    expect(insights?.match(/scope="col"/g)).toHaveLength(4)
    expect(insights?.match(/scope="row"/g)).toHaveLength(3)
    expect(insights).toMatch(/<th scope="row"[^>]*>P<\/th>.*<td>4\.0 kt<\/td>/)
    expect(insights).toContain('>Compare</th>')
    expect(insights).not.toContain('class="maneuver-insights__card"')
    expect(insights).not.toContain('used')
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.maneuver-insights__table\s*\{[\s\S]*?width: 100%;[\s\S]*?table-layout: fixed;/)
    expect(css).toMatch(/\.maneuver-insights__table th,\s*\.maneuver-insights__table td\s*\{[\s\S]*?overflow-wrap: anywhere;/)
    expect(css).not.toContain('.maneuver-insights__grid')
  })

  it('leaves the other role functional with insufficient or missing Comparison', () => {
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population(2)} comparison={null} />)
    expect(html).toContain('At least 3 profiles needed')
    expect(html).toContain('C profile data unavailable')
    expect(html).not.toContain('data-profile-series="primary-smoothed"')
    expect(html).toContain('—')
  })

  it('shows one-sided insights without a P/C claim', () => {
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population(3)} />)
    expect(html).toContain('4.0 kt')
    expect(html).toContain('SOG Maneuver Insights')
    expect(html).toContain('P unavailable')
    expect(html).not.toContain('C profile data unavailable')
    expect(html).toContain('6 kt')
    expect(html).toContain('3 kt')
  })

  it('shows neutral P/C readings from supported raw curves', () => {
    const primary = population(3)
    const comparison = population(3)
    for (const maneuver of primary.maneuvers) maneuver.grid.fill(4)
    for (const maneuver of comparison.maneuvers) maneuver.grid.fill(4.4)
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={comparison} />)
    expect(html).toContain('4.0 kt')
    expect(html).toContain('4.4 kt')
    expect(html.match(/C higher/g)).toHaveLength(3)
    expect(html).toMatch(new RegExp(`<th scope="row" style="color:${ACTIVITY_COLORS.primary}">P</th>(<td>4\\.0 kt</td>){3}`))
    expect(html).toMatch(new RegExp(`<th scope="row" style="color:${ACTIVITY_COLORS.comparison}">C</th>(<td>4\\.4 kt</td>){3}`))
    expect(html).toMatch(/<th scope="row">Compare<\/th>(<td>C higher<\/td>){3}/)
    expect(html).toContain('separate from table Recovery')
  })

  it('retains P higher, Similar, and unavailable comparative readings', () => {
    const primary = population(3)
    const comparison = population(3)
    for (const maneuver of primary.maneuvers) maneuver.grid.fill(5)
    for (const maneuver of comparison.maneuvers) maneuver.grid.fill(4)
    expect(renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={comparison} />).match(/P higher/g)).toHaveLength(3)
    for (const maneuver of comparison.maneuvers) maneuver.grid.fill(5)
    expect(renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={comparison} />).match(/<td>Similar<\/td>/g)).toHaveLength(3)
    const unavailable = renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={null} />)
    expect(unavailable).toMatch(/<th scope="row">Compare<\/th>(<td>—<\/td>){3}/)
  })

  it('shows coincident P/C recovery markers and separated accessible labels', () => {
    const primary = population(3)
    const comparison = population(3)
    for (const maneuver of [...primary.maneuvers, ...comparison.maneuvers]) {
      maneuver.grid.fill(5)
      maneuver.grid[27] = 4
    }
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={comparison} />)
    expect(html).toContain('data-profile-recovery="P"')
    expect(html).toContain('data-profile-recovery="C"')
    expect(html).toContain('P +3s')
    expect(html).toContain('C +3s')
    expect(html).toContain('Same recovery time')
    expect(html).toContain('maneuver-profile__recovery-label--p')
    expect(html).toContain('maneuver-profile__recovery-label--c')
    expect(html).toContain('P profile recovery at +3 seconds')
    expect(html).toContain('C profile recovery at +3 seconds')
    const pMarker = html.match(/<g data-profile-recovery="P"[\s\S]*?<\/g>/)?.[0]
    const cMarker = html.match(/<g data-profile-recovery="C"[\s\S]*?<\/g>/)?.[0]
    expect(pMarker).toContain('data-profile-recovery-guide="P" x1="560" x2="560" y1="8" y2="192"')
    expect(cMarker).toContain('data-profile-recovery-guide="C" x1="560" x2="560" y1="8" y2="192"')
    expect(pMarker).toContain(`stroke="${ACTIVITY_COLORS.primary}" stroke-opacity="0.22"`)
    expect(cMarker).toContain(`stroke="${ACTIVITY_COLORS.comparison}" stroke-opacity="0.22"`)
    expect(pMarker).toContain(`<circle cx="555" cy="69.33333333333334" r="5" fill="${ACTIVITY_COLORS.primary}" stroke="white"`)
    expect(cMarker).toContain(`<circle cx="565" cy="69.33333333333334" r="5" fill="${ACTIVITY_COLORS.comparison}" stroke="white"`)
    const pLabel = html.match(/<span class="maneuver-profile__recovery-label maneuver-profile__recovery-label--p"[^>]*>/)?.[0]
    const cLabel = html.match(/<span class="maneuver-profile__recovery-label maneuver-profile__recovery-label--c"[^>]*>/)?.[0]
    expect(pLabel).toContain(`background-color:${ACTIVITY_COLORS.primary}33`)
    expect(cLabel).toContain(`background-color:${ACTIVITY_COLORS.comparison}33`)
    expect(pLabel).toContain(`border-color:${ACTIVITY_COLORS.primary}80`)
    expect(cLabel).toContain(`border-color:${ACTIVITY_COLORS.comparison}80`)
    expect(pLabel).toContain('translateX(-50%)')
    expect(cLabel).toContain('translateX(-50%)')
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.maneuver-profile__recovery-label\s*\{[\s\S]*?color: #17323a;/)
    expect(css).toMatch(/\.maneuver-profile__recovery-label--p\s*\{\s*top: 3px;/)
    expect(css).toMatch(/\.maneuver-profile__recovery-label--c\s*\{\s*bottom: 3px;/)
  })

  it('keeps nearby recovery labels on separate top and bottom rows', () => {
    const primary = population(3)
    const comparison = population(3)
    for (const maneuver of primary.maneuvers) { maneuver.grid.fill(5); maneuver.grid[27] = 4 }
    for (const maneuver of comparison.maneuvers) { maneuver.grid.fill(5); maneuver.grid[28] = 4 }
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={comparison} />)
    expect(html).toContain('P +3s')
    expect(html).toContain('C +4s')
    expect(html).toContain('left:56%')
    expect(html).toContain('left:58%')
    expect(html).toContain('maneuver-profile__recovery-label--p')
    expect(html).toContain('maneuver-profile__recovery-label--c')
    expect(html).toContain(`background-color:${ACTIVITY_COLORS.primary}33`)
    expect(html).toContain(`background-color:${ACTIVITY_COLORS.comparison}33`)
    expect(html).toContain('P earlier')
  })

  it('keeps coincident +25s markers inside the chart edge', () => {
    const primary = population(3)
    const comparison = population(3)
    for (const maneuver of [...primary.maneuvers, ...comparison.maneuvers]) {
      maneuver.grid.fill(5)
      maneuver.grid[49] = 4
    }
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={primary} comparison={comparison} />)
    expect(html).toContain('data-profile-recovery-guide="P" x1="1000" x2="1000"')
    expect(html).toContain('data-profile-recovery-guide="C" x1="1000" x2="1000"')
    expect(html).toContain('<circle cx="988"')
    expect(html).toContain('<circle cx="997"')
    expect(html.match(/translateX\(-100%\)/g)).toHaveLength(2)
  })

  it('keeps a one-sided recovered marker without a C recovery claim', () => {
    const primary = population(3)
    for (const maneuver of primary.maneuvers) {
      maneuver.grid.fill(5)
      maneuver.grid[27] = 4
    }
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={primary} />)
    expect(html).toContain('data-profile-recovery="P"')
    expect(html).not.toContain('data-profile-recovery="C"')
    expect(html).not.toContain('C +3s')
  })

  it('shows an evidenced unrecovered state without placing a marker', () => {
    const primary = population(3)
    for (const maneuver of primary.maneuvers) {
      maneuver.grid.fill(5)
      for (let index = 27; index <= 50; index += 1) maneuver.grid[index] = 4
    }
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={primary} />)
    expect(html).toContain('P not reached by +25s')
    expect(html).not.toContain('data-profile-recovery="P"')
  })

  it('updates counts and insight availability for a filtered population', () => {
    const filtered = population(4)
    filtered.maneuvers[0].courseChangeDeg = 120
    filtered.maneuvers[1].nominalCoverage = 0.5
    const result = aggregatePreparedSogPopulation(filtered, 40, 100)
    expect(result).toMatchObject({ windowEligibleCount: 4, angularBandSelectedCount: 3, coverageEligibleCount: 2 })
    expect(supportedSogPoints(result).every((point) => point.sog === null)).toBe(true)
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={filtered} />)
    expect(html).toContain('4 in window')
    expect(html).toContain('2 used')
    expect(html).toContain('2 excluded')
    expect(html).toContain('At least 3 profiles needed')
  })

  it('reuses prepared profiles when the angular band moves', () => {
    const extract = vi.spyOn(rawProfiles, 'extractManeuverProfile')
    const center = Date.parse('2026-10-25T12:00:50Z')
    const maneuver = { start_time: new Date(center - 2_000).toISOString(), center_time: new Date(center).toISOString(), end_time: new Date(center + 2_000).toISOString() } as Parameters<typeof prepareSogManeuverPopulation>[0][number]
    const samples = Array.from({ length: 51 }, (_, index) => ({
      utc: new Date(center + (index - 25) * 1_000).toISOString(),
      lat: 0, lon: 0, dist: 0, sog: 4, cog: 60, hdg: null, heel: null, trim: null,
    }))
    const prepared = prepareSogManeuverPopulation([maneuver], samples, { start: center - 30_000, end: center + 30_000 })
    const afterPreparation = extract.mock.calls.length
    aggregatePreparedSogPopulation(prepared, 40, 100)
    aggregatePreparedSogPopulation(prepared, 60, 120)
    expect(afterPreparation).toBe(1)
    expect(extract).toHaveBeenCalledTimes(afterPreparation)
    extract.mockRestore()
  })
})

describe('angular band interaction rules', () => {
  const initial = { minimum: 40, maximum: 100 }
  it('moves either endpoint in 5° steps with inclusive limits', () => {
    expect(moveAngleBand(initial, 'minimum', 47)).toEqual({ minimum: 45, maximum: 100 })
    expect(moveAngleBand(initial, 'maximum', 95)).toEqual({ minimum: 40, maximum: 95 })
    expect(moveAngleBand(initial, 'minimum', 120)).toEqual({ minimum: 95, maximum: 100 })
  })
  it('translates the whole band without changing its width', () => {
    expect(moveAngleBand(initial, 'band', 110)).toEqual({ minimum: 110, maximum: 170 })
    expect(moveAngleBand(initial, 'band', 160)).toEqual({ minimum: 120, maximum: 180 })
  })
  it('maps touch pointer positions onto the band and clamps either edge', () => {
    expect(pointerAngleDegrees(100, 100, 360)).toBe(0)
    expect(pointerAngleDegrees(300, 100, 360)).toBe(100)
    expect(moveAngleBand(initial, 'band', initial.minimum + pointerAngleDegrees(320, 100, 360) - pointerAngleDegrees(180, 100, 360))).toEqual({ minimum: 110, maximum: 170 })
    expect(pointerAngleDegrees(500, 100, 360)).toBe(180)
    const touch = { pointerId: 7, part: 'band' as const, startDegrees: 40, startMinimum: 40 }
    expect(updateAngleGesture(initial, touch, 7, 110)).toEqual({ minimum: 110, maximum: 170 })
    expect(updateAngleGesture(initial, touch, 8, 110)).toBeNull()
  })
  it('supports keyboard arrows and bounds for all three draggable parts', () => {
    expect(angleRangeKeyboard(initial, 'minimum', 'ArrowRight')).toEqual({ minimum: 45, maximum: 100 })
    expect(angleRangeKeyboard(initial, 'maximum', 'End')).toEqual({ minimum: 40, maximum: 180 })
    expect(angleRangeKeyboard(initial, 'band', 'Home')).toEqual({ minimum: 0, maximum: 60 })
    expect(angleRangeKeyboard(initial, 'band', 'Escape')).toBeNull()
  })
})
