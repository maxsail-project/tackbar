import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PreparedSogPopulation } from '../utils/typicalSogProfile'

const selection = vi.hoisted(() => ({ signal: 'SOG' as 'SOG' | 'COG' }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual,
    useState: (initial: unknown) => initial === 'SOG'
      ? [selection.signal, (value: 'SOG' | 'COG') => { selection.signal = value }] : [initial, () => {}],
    useMemo: (factory: () => unknown) => factory(),
  }
})

import ManeuverSogComparison from './ManeuverSogComparison'

function population(values: number[]): PreparedSogPopulation {
  return { detectedCount: 3, windowEligibleCount: 3, missingCourseCount: 0,
    maneuvers: values.map((value) => ({ courseChangeDeg: 60,
      nominalCoverage: 1, grid: Array(51).fill(5), cogNominalCoverage: 1,
      cogGrid: Array.from({ length: 51 }, (_, index) => value * (index - 25) / 25) })) }
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

describe('maneuver signal selection', () => {
  it('switches from SOG to COG and back through the signal buttons', () => {
    selection.signal = 'SOG'
    signalButton(ManeuverSogComparison({ primary: population([20, 30, 40]) }), 'COG')?.props.onClick()
    expect(selection.signal).toBe('COG')
    signalButton(ManeuverSogComparison({ primary: population([20, 30, 40]) }), 'SOG')?.props.onClick()
    expect(selection.signal).toBe('SOG')
  })

  it('renders independent P/C relative COG curves and hides SOG-only interpretation', () => {
    selection.signal = 'COG'
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population([20, 30, 40])}
      comparison={population([25, 35, 45])} />)
    expect(html).toContain('Typical COG maneuver comparison')
    expect(html).toContain('Median relative COG turn')
    expect(html).toContain('data-profile-series="primary-raw"')
    expect(html).toContain('data-profile-series="comparison-smoothed"')
    expect(html).toContain('40 °')
    expect(html).toContain('-40 °')
    expect(html).toContain('not geographic course')
    expect(html).toContain('data-maneuver-center="true"')
    expect(html).not.toContain('Maneuver Insights')
    expect(html).not.toContain('Profile recovery')
    expect(html).toMatch(/aria-pressed="true"[^>]*>COG<\/button>/)
  })

  it('returns to existing SOG display with its insights and recovery', () => {
    selection.signal = 'SOG'
    const html = renderToStaticMarkup(<ManeuverSogComparison primary={population([20, 30, 40])} />)
    expect(html).toContain('Typical SOG maneuver comparison')
    expect(html).toContain('Maneuver Insights')
    expect(html).toContain('Profile recovery')
    expect(html).toContain('5 kt')
    expect(html).toMatch(/aria-pressed="true"[^>]*>SOG<\/button>/)
  })
})
