import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PreparedSogPopulation } from '../utils/typicalSogProfile'

const selection = vi.hoisted(() => ({ signal: 'HEEL' as 'SOG' | 'COG' | 'HEEL' }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual,
    useState: (initial: unknown) => initial === 'SOG'
      ? [selection.signal, (value: 'SOG' | 'COG' | 'HEEL') => { selection.signal = value }] : [initial, () => {}],
    useMemo: (factory: () => unknown) => factory(),
  }
})

import ManeuverSogComparison from './ManeuverSogComparison'

function population(values: number[]): PreparedSogPopulation {
  return { detectedCount: values.length, windowEligibleCount: values.length, missingCourseCount: 0,
    maneuvers: values.map((value) => ({ courseChangeDeg: 60, nominalCoverage: 1, grid: Array(51).fill(5),
      heelNominalCoverage: 1, heelGrid: Array(51).fill(value) })) }
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

describe('typical HEEL chart selection', () => {
  it('switches among SOG, COG and HEEL using the general metric buttons', () => {
    const input = { primary: population([4, 6, 8]) }
    signalButton(ManeuverSogComparison(input), 'HEEL')?.props.onClick()
    expect(selection.signal).toBe('HEEL')
    let html = renderToStaticMarkup(<ManeuverSogComparison {...input} />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>HEEL<\/button>/)
    expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))')
    signalButton(ManeuverSogComparison(input), 'COG')?.props.onClick()
    expect(selection.signal).toBe('COG')
    signalButton(ManeuverSogComparison(input), 'SOG')?.props.onClick()
    expect(selection.signal).toBe('SOG')
    html = renderToStaticMarkup(<ManeuverSogComparison {...input} />)
    expect(html).toContain('Profile recovery')
  })

  it('shows independent P/C HEEL curves, magnitude label, shared nonnegative axis and no Insights', () => {
    selection.signal = 'HEEL'
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population([4, 6, 8])}
      comparison={population([10, 12, 14])} />)
    expect(html).toContain('Typical HEEL maneuver comparison')
    expect(html).toContain('Median |HEEL| (°), magnitude of signed inclination')
    expect(html).toContain('Median absolute HEEL magnitude')
    expect(html).toContain('data-profile-series="primary-raw"')
    expect(html).toContain('data-profile-series="comparison-smoothed"')
    expect(html).toMatch(/sog-signal-chart__y-axis[^>]*><span>13 °<\/span><span>9\.0 °<\/span><span>5 °<\/span>/)
    expect(html).toContain('data-maneuver-center="true"')
    expect(html).not.toContain('Maneuver Insights')
    expect(html).not.toContain('Profile recovery')
  })

  it('shows weak support, insufficient population, and one-Activity states honestly', () => {
    selection.signal = 'HEEL'
    const weak = population([4, 6, 8])
    weak.maneuvers[2].heelGrid![25] = null
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={weak} />)
    expect(html).toContain('3 used')
    expect(html).toContain('data-profile-series="primary-raw"')
    expect(html).toMatch(/data-profile-series="primary-raw" d="M[^"]* M/)
    expect(html).not.toContain('data-profile-series="comparison-raw"')
    const sparse = renderToStaticMarkup(<ManeuverSogComparison primary={population([4, 6])} />)
    expect(sparse).toContain('At least 3 profiles needed')
    expect(sparse).not.toContain('data-profile-series="primary-raw"')
    const missing = renderToStaticMarkup(<ManeuverSogComparison primary={null} />)
    expect(missing).toContain('P profile data unavailable')
  })
})
