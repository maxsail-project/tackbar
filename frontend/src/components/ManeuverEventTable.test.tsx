import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import ManeuverEventTable, { ManeuverEventRow } from './ManeuverEventTable'

const event: DisplayManeuver = {
  activityRole: 'primary',
  centerTimeMs: Date.parse('2031-06-15T08:47:59Z'),
  maneuver: {
    start_time: '2031-06-15T08:47:55Z',
    center_time: '2031-06-15T08:47:59Z',
    end_time: '2031-06-15T08:48:05Z',
    heading_change_deg: -90.6,
    peak_turn_rate_deg_s: 12,
    peak_turn_rate_time: '2031-06-15T08:47:59Z',
  },
}

describe('ManeuverEventTable', () => {
  it('renders the compact columns and an accessible event action', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[event]}
        primaryStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Time')
    expect(markup).toContain('Activity')
    expect(markup).toContain('ΔHDG')
    expect(markup).toContain('08:47:59')
    expect(markup).toContain('−91°')
    expect(markup).toContain('Move replay to 08:47:59 UTC, Activity P')
  })

  it('activates an event with its center time', () => {
    const onSelect = vi.fn()
    const row = ManeuverEventRow({ event, onSelect }) as ReactElement<{
      onClick: () => void
    }>

    row.props.onClick()

    expect(onSelect).toHaveBeenCalledWith(event.centerTimeMs)
  })

  it('shows the empty Analysis Window state for available analytics', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[]}
        primaryStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('No maneuvers detected in this Analysis Window.')
  })

  it('shows the empty state when all selected analytics are available', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[]}
        primaryStatus="available"
        comparisonStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('No maneuvers detected in this Analysis Window.')
  })

  it('shows unavailable P without treating the Viewer as failed', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[]}
        primaryStatus="unavailable"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Maneuver analytics unavailable for P.')
    expect(markup).not.toContain('No maneuvers detected')
  })

  it('contains a technical analytics error inside the maneuver section', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[]}
        primaryStatus="error"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Maneuver analytics unavailable for P.')
    expect(markup).toContain('Maneuvers')
  })

  it('keeps Primary events visible when C analytics is unavailable', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[event]}
        primaryStatus="available"
        comparisonStatus="unavailable"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Maneuver analytics unavailable for C.')
    expect(markup).toContain('08:47:59')
  })

  it.each(['unavailable', 'error'] as const)(
    'does not show the generic empty state when C analytics is %s',
    (comparisonStatus) => {
      const markup = renderToStaticMarkup(
        <ManeuverEventTable
          events={[]}
          primaryStatus="available"
          comparisonStatus={comparisonStatus}
          onSelect={() => undefined}
        />,
      )

      expect(markup).toContain('Maneuver analytics unavailable for C.')
      expect(markup).not.toContain('No maneuvers detected')
    },
  )
})
