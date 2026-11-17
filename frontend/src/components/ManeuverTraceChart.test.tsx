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
import ManeuverTraceChart, { medianPath, traceScaleBarMetres, traceViewFrame } from './ManeuverTraceChart'
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
    expect(html).toContain('bisector aligned')
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
