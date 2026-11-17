/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { PreparedManeuverTrace, TurnSide } from '../utils/maneuverTrace'
import type { PreparedSogPopulation } from '../utils/typicalSogProfile'

const selection = vi.hoisted(() => ({ signal: 'TRACE' as 'SOG' | 'COG' | 'HEEL' | 'TRACE' }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual,
    useState: (initial: unknown) => initial === 'SOG'
      ? [selection.signal, (value: typeof selection.signal) => { selection.signal = value }] : [initial, () => {}],
    useMemo: (factory: () => unknown) => factory(),
  }
})

import ManeuverSogComparison from './ManeuverSogComparison'
import ManeuverTraceChart, { medianPath, traceScaleBarMetres, traceViewFrame, turnSideReading } from './ManeuverTraceChart'
import { roundedInsightComparison } from '../utils/insightComparison'
import { aggregatePreparedTracePopulation } from '../utils/maneuverTrace'

function trace(side: TurnSide, scale = 1, coverage = 1, gapAt: number[] = []): PreparedManeuverTrace {
  const sign = side === 'right' ? 1 : -1
  const at = (offset: number) => ({ x: sign * 3 * Math.abs(offset) * scale, y: 4 * offset * scale })
  return {
    status: 'traced', side, nominalCoverage: coverage,
    segments: [Array.from({ length: 51 }, (_, index) => at(index - 25))],
    grid: Array.from({ length: 51 }, (_, index) => gapAt.includes(index - 25) ? null : at(index - 25)),
  }
}

function population(traces: (PreparedManeuverTrace | { status: 'ambiguous_turn' | 'missing_center' })[], extra: Partial<PreparedSogPopulation> = {}): PreparedSogPopulation {
  return { detectedCount: traces.length, windowEligibleCount: traces.length, missingCourseCount: 0,
    maneuvers: traces.map((value) => ({ courseChangeDeg: 60, nominalCoverage: 1, grid: Array(51).fill(5), trace: value })),
    ...extra }
}

function signalButton(node: unknown, signal: string): { props: { onClick: () => void } } | null {
  if (Array.isArray(node)) return node.map((part) => signalButton(part, signal)).find(Boolean) ?? null
  if (typeof node !== 'object' || node === null || !('props' in node)) return null
  const element = node as { type: unknown, props: { children?: unknown, onClick?: () => void } }
  if (element.type === 'button' && element.props.children === signal && element.props.onClick) {
    return element as { props: { onClick: () => void } }
  }
  return signalButton(element.props.children, signal)
}

describe('TRACE geometry frame', () => {
  it('uses a square metre frame so 1 m horizontally equals 1 m vertically', () => {
    const frame = traceViewFrame([{ x: 30, y: -10 }, { x: -5, y: 120 }])
    expect(frame.side).toBeCloseTo(130 * 1.12, 9)
    expect(frame.minX).toBeCloseTo(-frame.side / 2, 9)
    // Forward (positive y) maps to negative SVG y.
    expect(frame.minY).toBeLessThanOrEqual(-120)
    expect(frame.minY + frame.side).toBeGreaterThanOrEqual(10)
    expect(traceViewFrame([]).side).toBeCloseTo(20 * 1.12, 9)
  })

  it('chooses a round metre scale bar', () => {
    expect(traceScaleBarMetres(100)).toBe(20)
    expect(traceScaleBarMetres(22.4)).toBe(5)
    expect(traceScaleBarMetres(400)).toBe(100)
  })

  it('never bridges unsupported median offsets', () => {
    const aggregate = aggregatePreparedTracePopulation(population([trace('right', 1, 1, [3]), trace('right', 1, 1, [3]), trace('right')]), 40, 100)
    expect(aggregate.right.median[28].point).toBeNull()
    expect(medianPath(aggregate.right).match(/M/g)).toHaveLength(2)
  })
})

describe('TRACE chart rendering', () => {
  it('renders equal-scale SVG, the t=0 origin, scale bar and P/C × side paths', () => {
    const primary = aggregatePreparedTracePopulation(population([trace('right'), trace('right', 1.1), trace('right', 0.9), trace('left'), trace('left', 1.2)]), 40, 100)
    const comparison = aggregatePreparedTracePopulation(population([trace('right', 1.3), trace('right', 1.2), trace('right', 1.4)]), 40, 100)
    const html = renderToStaticMarkup(<ManeuverTraceChart primary={primary} comparison={comparison} />)
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"')
    const viewBox = html.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    expect(viewBox[2]).toBeCloseTo(viewBox[3], 9)
    expect(html).toContain('data-trace-origin="true"')
    expect(html).toContain('>t=0</text>')
    expect(html).toMatch(/data-trace-scale-bar="\d+"/)
    expect(html).toMatch(/<text[^>]*>\d+ m<\/text>/)
    expect(html).toContain('entry/exit bisector')
    expect(html).not.toMatch(/Bisector \d/)
    expect(html).not.toMatch(/TWD \d|data-twd/i)
    expect(html).toContain('no TWD')
    for (const series of ['primary-right', 'primary-left', 'comparison-right']) {
      expect(html).toContain(`data-trace-individual="${series}"`)
    }
    expect(html).toContain('data-trace-median="primary-right"')
    expect(html).toContain('data-trace-median="comparison-right"')
    expect(html).not.toContain('data-trace-median="primary-left"')
    expect(html).toContain(`stroke="${ACTIVITY_COLORS.primary}" stroke-width="0.8"`)
    expect(html).toContain(`stroke="${ACTIVITY_COLORS.primary}" stroke-width="3.5"`)
    expect(html).toContain(`stroke="${ACTIVITY_COLORS.comparison}" stroke-width="3.5"`)
    expect(html).toContain('5 traced')
    expect(html).toContain('R 3 traced, median from 3')
    expect(html).toContain('L 2 traced, median insufficient (2/3 with ≥65% coverage)')
    expect(html).toContain('not a sailed track')
  })

  it('titles both axes by mean course and turn side, replacing the terse edge labels (D5)', () => {
    const primary = aggregatePreparedTracePopulation(population([trace('right'), trace('left')]), 40, 100)
    const html = renderToStaticMarkup(<ManeuverTraceChart primary={primary} />)
    expect(html).toMatch(/data-trace-axis="along">Along mean course \(m\) · forward up<\/p>/)
    expect(html).toMatch(/data-trace-axis="across">\s*<span>← Left turns<\/span><span>Across mean course \(m\)<\/span><span>Right turns →<\/span>/)
    expect(html).not.toContain('↑ Forward')
    expect(html).not.toContain('Left turns · Right turns')
    const figure = html.slice(html.indexOf('<figure'), html.indexOf('</figure>'))
    expect(figure.match(/Left turns/g)).toHaveLength(1)
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(html).toContain('data-trace-origin="true"')
  })

  it('adds one concise reading note covering arms, lean and median length (D5)', () => {
    const primary = aggregatePreparedTracePopulation(population([trace('right')]), 40, 100)
    const html = renderToStaticMarkup(<ManeuverTraceChart primary={primary} />)
    expect(html.match(/data-trace-reading-note/g)).toHaveLength(1)
    const note = html.match(/data-trace-reading-note="true">([\s\S]*?)<\/p>/)![1]
    expect(note).toContain('How to read')
    expect(note).toContain('not north or wind (no TWD)')
    expect(note).toContain('1 m = 1 m')
    expect(note).toContain('lower arm is the approach before t=0 and the upper arm the exit')
    expect(note).toContain('about half the turn angle, so wider arms mean larger turns')
    expect(note).toContain('a shorter median means less distance in the same time, not a tighter turn')
    expect(note).toContain('not a sailed track')
    expect(note).toContain('3 maneuvers with ≥65% position coverage and 3 contributors at each drawn second')
    expect(note).not.toMatch(/\d+(\.\d+)?°/)
    expect(html.match(/maneuver-profile__basis/g)).toHaveLength(1)
  })

  it('shows individual traces with an insufficient-median indication and visible exclusions', () => {
    const primary = aggregatePreparedTracePopulation(population(
      [trace('right'), trace('right', 1, 0.5), { status: 'ambiguous_turn' }, { status: 'missing_center' }],
      { windowEligibleCount: 6, missingCourseCount: 2 },
    ), 40, 100)
    const html = renderToStaticMarkup(<ManeuverTraceChart primary={primary} />)
    expect(html).toContain('data-trace-individual="primary-right"')
    expect(html).not.toContain('data-trace-median')
    expect(html).toContain('6 in window · 2 traced')
    expect(html).toContain('4 excluded (2 without common ΔCOG, 1 0°/180° turn, 1 without t=0 position)')
    expect(html).toContain('R 2 traced, median insufficient (1/3')
    expect(html).not.toContain('data-trace-count="C"')
  })

  it('supports one Activity, and an unavailable comparison', () => {
    const primary = aggregatePreparedTracePopulation(population([trace('left')]), 40, 100)
    expect(renderToStaticMarkup(<ManeuverTraceChart primary={primary} />)).not.toContain('C profile data unavailable')
    expect(renderToStaticMarkup(<ManeuverTraceChart primary={primary} comparison={null} />)).toContain('C profile data unavailable')
    const empty = renderToStaticMarkup(<ManeuverTraceChart primary={aggregatePreparedTracePopulation(population([]), 40, 100)} />)
    expect(empty).toContain('No traceable maneuver')
    expect(empty).toContain('data-trace-origin="true"')
  })

  it('keeps the plot square and responsive in CSS', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.maneuver-trace__plot\s*\{[\s\S]*?aspect-ratio: 1 \/ 1;/)
    expect(css).toMatch(/\.maneuver-trace\s*\{[\s\S]*?width: 100%;/)
    expect(css).toMatch(/\.maneuver-trace__frame\s*\{[\s\S]*?grid-template-columns: auto minmax\(0, 1fr\);/)
    expect(css).toMatch(/\.maneuver-trace__axis--along\s*\{[\s\S]*?writing-mode: vertical-rl;/)
    expect(css).toMatch(/\.maneuver-trace__axis--across\s*\{[\s\S]*?flex-wrap: wrap;/)
  })
})

describe('TRACE as the fourth Maneuver Profiles option', () => {
  const input = {
    primary: population([trace('right'), trace('right'), trace('right')]),
    comparison: population([trace('left'), trace('left'), trace('left')]),
  }

  it('switches SOG → TRACE → SOG and replaces the temporal chart', () => {
    selection.signal = 'SOG'
    let html = renderToStaticMarkup(<ManeuverSogComparison {...input} />)
    expect(html).toContain('grid-template-columns:repeat(4, minmax(0, 1fr))')
    expect(html.match(/<button type="button"[^>]*aria-pressed/g)).toHaveLength(4)
    expect(html).toMatch(/aria-pressed="false"[^>]*>TRACE<\/button>/)
    expect(html).not.toContain('data-trace-chart')

    signalButton(ManeuverSogComparison(input), 'TRACE')?.props.onClick()
    expect(selection.signal).toBe('TRACE')
    html = renderToStaticMarkup(<ManeuverSogComparison {...input} />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>TRACE<\/button>/)
    expect(html).toContain('aria-label="Maneuver trace comparison"')
    expect(html).toContain('data-trace-chart="true"')
    expect(html).toContain('data-trace-median="primary-right"')
    expect(html).toContain('data-trace-median="comparison-left"')
    expect(html).not.toContain('sog-signal-chart')
    expect(html).not.toContain('data-maneuver-center')
    expect(html).not.toContain('Maneuver Insights')
    expect(html).not.toContain('used')
    expect(html).toContain('|ΔCOG|')
    expect(html).toContain('role="slider"')

    signalButton(ManeuverSogComparison(input), 'SOG')?.props.onClick()
    html = renderToStaticMarkup(<ManeuverSogComparison {...input} />)
    expect(html).not.toContain('data-trace-chart')
    expect(html).toContain('data-maneuver-center')
    expect(html).toContain('SOG Maneuver Insights')
  })
})

describe('TRACE median event |ΔCOG| table (#202)', () => {
  function angled(entries: [TurnSide, number][]): PreparedSogPopulation {
    return { detectedCount: entries.length, windowEligibleCount: entries.length, missingCourseCount: 0,
      maneuvers: entries.map(([side, deg]) => ({ courseChangeDeg: deg, nominalCoverage: 1, grid: [], trace: trace(side) })) }
  }
  const tableOf = (html: string) => html.match(/<section class="maneuver-insights"[^>]*data-trace-turn-angles="true">[\s\S]*?<\/section>/)![0]
  const cells = (row: string) => row.match(/<td[^>]*>[^<]*<\/td>/g)!.map((cell) => cell.replace(/<\/?td[^>]*>/g, ''))
  const rowOf = (table: string, label: string) => cells(table.match(new RegExp(`<tr[^>]*><th scope="row"[^>]*>${label}</th>([\\s\\S]*?)</tr>`))![1])
  const differenceRow = (table: string) => cells(table.match(/<th scope="row" aria-label="Comparison"><\/th>([\s\S]*?)<\/tr>/)![1])
  const readingOf = (table: string) => table.match(/data-trace-turn-side-difference="true">([\s\S]*?)<\/p>/)![1].replace(/<[^>]+>/g, '')

  it('mirrors the Insights tables: Left/Right turn columns, P, C and an unlabeled difference row', () => {
    const primary = aggregatePreparedTracePopulation(angled([['left', 90], ['left', 95], ['left', 100], ['right', 80], ['right', 85], ['right', 90], ['right', 95]]), 40, 100)
    const comparison = aggregatePreparedTracePopulation(angled([['left', 88], ['left', 92], ['left', 96], ['right', 90], ['right', 91]]), 40, 100)
    const html = renderToStaticMarkup(<ManeuverTraceChart primary={primary} comparison={comparison} band={{ minimum: 40, maximum: 100 }} />)
    const table = tableOf(html)
    expect(table).toContain('<h3>Median event |ΔCOG|</h3>')
    expect(table).toContain('<p>Supported median per-event |ΔCOG| · band 40°–100°</p>')
    expect(table).not.toContain('not the COG Insights Turn angle')
    expect(table).toMatch(/<thead><tr><th scope="col" aria-label="Activity"><\/th><th scope="col">Left turns<\/th><th scope="col">Right turns<\/th><\/tr><\/thead>/)
    expect(table).not.toContain('L − R')
    expect(table).not.toContain('P − C')
    expect(rowOf(table, 'P')).toEqual(['95.0° (3)', '87.5° (4)'])
    expect(rowOf(table, 'C')).toEqual(['92.0° (3)', '90.5° (2)'])
    // Right: P has 4, C has 2 → computed but indicative.
    expect(differenceRow(table)).toEqual(['P +3.0°', 'C +3.0°'])
    expect(readingOf(table)).toBe('Turn-side difference · P left +7.5° · C left +1.5° (few maneuvers)')
    expect(table).not.toContain('unavailable')
    expect(table).toContain('class="maneuver-insights__recovery"')
    expect(table).not.toMatch(/\b(port|starboard|tacks?|gybes?|TWD)\b/i)
    // The table sits below the plot and before the reading note.
    expect(html.indexOf('</figure>')).toBeLessThan(html.indexOf('data-trace-turn-angles'))
    expect(html.indexOf('data-trace-turn-angles')).toBeLessThan(html.indexOf('data-trace-reading-note'))
  })

  it('keeps C and the difference row as "—" in a single-Activity view', () => {
    const primary = aggregatePreparedTracePopulation(angled([['left', 90], ['left', 92], ['left', 94], ['right', 80], ['right', 82], ['right', 84]]), 40, 100)
    const table = tableOf(renderToStaticMarkup(<ManeuverTraceChart primary={primary} band={{ minimum: 40, maximum: 100 }} />))
    expect(rowOf(table, 'P')).toEqual(['92.0° (3)', '82.0° (3)'])
    expect(rowOf(table, 'C')).toEqual(['—', '—'])
    expect(differenceRow(table)).toEqual(['—', '—'])
    expect(readingOf(table)).toBe('Turn-side difference · P left +10.0° · C —')
    expect(table).not.toContain('unavailable')
    expect(table).not.toContain('maneuver-insights__cell--indicative')
  })

  it('reads right, similar and P/C differences with the shared Insights format', () => {
    const primary = aggregatePreparedTracePopulation(angled([['left', 80], ['left', 82], ['left', 84], ['right', 90], ['right', 92], ['right', 94]]), 40, 100)
    const comparison = aggregatePreparedTracePopulation(angled([['left', 82.03], ['left', 82.03], ['left', 82.03], ['right', 82], ['right', 82], ['right', 82]]), 40, 100)
    const table = tableOf(renderToStaticMarkup(<ManeuverTraceChart primary={primary} comparison={comparison} band={{ minimum: 40, maximum: 100 }} />))
    expect(rowOf(table, 'P')).toEqual(['82.0° (3)', '92.0° (3)'])
    expect(rowOf(table, 'C')).toEqual(['82.0° (3)', '82.0° (3)'])
    expect(differenceRow(table)).toEqual(['Similar', 'P +10.0°'])
    expect(readingOf(table)).toBe('Turn-side difference · P right +10.0° · C similar')
    expect(table).not.toMatch(/<td>[−+]\d/)
  })

  it('shows 1, 2 and ≥3 maneuver cells with counts, muting 1–2 and their comparisons as indicative', () => {
    const primary = aggregatePreparedTracePopulation(angled([['left', 70], ['right', 90], ['right', 95]]), 40, 100)
    const comparison = aggregatePreparedTracePopulation(angled([['left', 60], ['left', 62], ['left', 64], ['right', 80], ['right', 82], ['right', 84]]), 40, 100)
    const table = tableOf(renderToStaticMarkup(<ManeuverTraceChart primary={primary} comparison={comparison} band={{ minimum: 40, maximum: 100 }} />))
    expect(rowOf(table, 'P')).toEqual(['70.0° (1)', '92.5° (2)'])
    expect(rowOf(table, 'C')).toEqual(['62.0° (3)', '82.0° (3)'])
    // Both operands have values but P is below 3: comparisons are computed and muted as indicative.
    expect(differenceRow(table)).toEqual(['P +8.0°', 'P +10.5°'])
    expect(readingOf(table)).toBe('Turn-side difference · P right +22.5° (few maneuvers) · C right +20.0°')
    const mutedDifferences = [...table.matchAll(/<td class="maneuver-insights__cell--indicative" title="Indicative: fewer than 3 traced maneuvers">([^<]*)<\/td>/g)].map((match) => match[1])
    expect(mutedDifferences).toEqual(['70.0° (1)', '92.5° (2)', 'P +8.0°', 'P +10.5°'])
    expect(table).toMatch(/<span style="color:#168097" class="maneuver-insights__cell--indicative" title="Indicative: fewer than 3 traced maneuvers">P right \+22\.5° \(few maneuvers\)<\/span>/)
    expect(table).toMatch(/<span style="color:#9a5aaf">C right \+20\.0°<\/span>/)
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.wind-segments__label--muted,\s*\.maneuver-insights__cell--indicative \{ opacity: 0\.6; \}/)
  })

  it('shows "—" without muting for an empty group', () => {
    const primary = aggregatePreparedTracePopulation(angled([['left', 70], ['left', 72], ['left', 74]]), 40, 100)
    const table = tableOf(renderToStaticMarkup(<ManeuverTraceChart primary={primary} band={{ minimum: 40, maximum: 100 }} />))
    expect(rowOf(table, 'P')).toEqual(['72.0° (3)', '—'])
    expect(table).not.toContain('maneuver-insights__cell--indicative')
  })

  it('reads a role with one indicative side as "(few maneuvers)" and a role without data as "—"', () => {
    const primary = aggregatePreparedTracePopulation(angled([['left', 80], ['left', 82], ['right', 90], ['right', 92], ['right', 94]]), 40, 100)
    expect(turnSideReading(primary)).toEqual({ text: 'right +11.0° (few maneuvers)', indicative: true })
    const similar = aggregatePreparedTracePopulation(angled([['left', 80], ['right', 80.04]]), 40, 100)
    expect(turnSideReading(similar)).toEqual({ text: 'similar (few maneuvers)', indicative: true })
    const leftOnly = aggregatePreparedTracePopulation(angled([['left', 80], ['left', 82], ['left', 84]]), 40, 100)
    expect(turnSideReading(leftOnly)).toEqual({ text: '—', indicative: false })
    expect(turnSideReading(null)).toEqual({ text: '—', indicative: false })
    expect(turnSideReading(undefined)).toEqual({ text: '—', indicative: false })
  })

  it('generalizes the shared Insights comparison to L/R labels without changing P/C', () => {
    expect(roundedInsightComparison(96.3, 90, '°', ['L', 'R'])).toBe('L +6.3°')
    expect(roundedInsightComparison(88, 90.1, '°', ['L', 'R'])).toBe('R +2.1°')
    expect(roundedInsightComparison(90, 90.04, '°', ['L', 'R'])).toBe('Similar')
    expect(roundedInsightComparison(null, 90, '°', ['L', 'R'])).toBe('—')
    expect(roundedInsightComparison(92.3, 90, '°')).toBe('P +2.3°')
    expect(roundedInsightComparison(89, 90, '°')).toBe('C +1.0°')
  })

  it('follows the shared band in the Maneuver Profiles TRACE view', () => {
    selection.signal = 'TRACE'
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={angled([['right', 50], ['right', 70], ['right', 90], ['right', 110]])} />)
    const table = tableOf(html)
    expect(table).toContain('band 40°–100°')
    expect(rowOf(table, 'P')).toEqual(['—', '70.0° (3)'])
    expect(rowOf(table, 'C')).toEqual(['—', '—'])
    expect(differenceRow(table)).toEqual(['—', '—'])
  })
})
