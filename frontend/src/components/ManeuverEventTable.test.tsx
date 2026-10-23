import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import { maneuverSelectionKey } from '../utils/maneuverEvents'
import ManeuverEventTable, {
  ManeuverEventRow,
  sortManeuverEvents,
  toggledExpandedState,
  toggledSortDirection,
} from './ManeuverEventTable'

const event: DisplayManeuver = {
  activityRole: 'primary',
  centerTimeMs: Date.parse('2031-06-15T08:47:59Z'),
  maneuver: {
    start_time: '2031-06-15T08:47:55Z',
    center_time: '2031-06-15T08:47:59Z',
    end_time: '2031-06-15T08:48:05Z',
    heading_change_deg: -90.6,
    course_change_deg: null,
    peak_turn_rate_deg_s: 12,
    peak_turn_rate_time: '2031-06-15T08:47:59Z',
    duration_s: 10,
    sog_entry_kn: 5.2,
    sog_min_kn: 3.1,
    sog_exit_kn: 5.1,
    recovery_time_s: 12.4,
    speed_loss_distance_m: 8.6,
    speed_loss_time_s: 3.3,
  },
}

function eventAt(
  centerTimeMs: number,
  activityRole: DisplayManeuver['activityRole'] = 'primary',
): DisplayManeuver {
  const centerTime = new Date(centerTimeMs).toISOString()
  return {
    activityRole,
    centerTimeMs,
    maneuver: {
      ...event.maneuver,
      start_time: new Date(centerTimeMs - 1_000).toISOString(),
      center_time: centerTime,
      end_time: new Date(centerTimeMs + 1_000).toISOString(),
    },
  }
}

function cellTexts(markup: string, tag: 'th' | 'td') {
  return [...markup.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'g'))]
    .map((match) => match[1].replace(/<[^>]+>/g, ''))
}

describe('ManeuverEventTable', () => {
  it.each([
    ['HIGH', 'HIGH'], ['LOW', 'LOW'], ['HIGH', 'LOW'], ['LOW', 'HIGH'],
  ] as const)('shows P %s and C %s evidence above the unchanged table', (primary, comparison) => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[event]} primaryStatus="available" comparisonStatus="available"
      primaryDetectorMode={primary} comparisonDetectorMode={comparison} onSelect={vi.fn()}
    />)
    expect(markup).toContain(`P · ${primary} evidence`)
    expect(markup).toContain(`C · ${comparison} evidence`)
    expect(markup.indexOf('id="maneuver-title"')).toBeLessThan(markup.indexOf('class="maneuver-evidence"'))
    expect(markup.indexOf('class="maneuver-evidence"')).toBeLessThan(markup.indexOf('<table'))
    expect(cellTexts(markup, 'th')).toHaveLength(10)
    expect(cellTexts(markup, 'td').join(' ')).not.toContain('evidence')
  })

  it.each(['HIGH', 'LOW'] as const)('retains single-P %s evidence with available zero events', (mode) => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[]} primaryStatus="available" primaryDetectorMode={mode}
      comparisonDetectorMode="LOW" onSelect={vi.fn()}
    />)
    expect(markup).toContain(`P · ${mode} evidence`)
    expect(markup).not.toContain('C ·')
    expect(markup).toContain('No maneuvers detected in this Analysis Window.')
  })

  it.each(['unavailable', 'error', 'loading'] as const)('omits evidence for %s analytics without hiding the available role', (status) => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[]} primaryStatus={status} comparisonStatus="available"
      primaryDetectorMode="LOW" comparisonDetectorMode="HIGH" onSelect={vi.fn()}
    />)
    expect(markup).not.toContain('P · LOW evidence')
    expect(markup).toContain('C · HIGH evidence')
    expect(markup).toContain(status === 'loading'
      ? 'Loading maneuver analytics for P…' : 'Maneuver analytics unavailable for P.')
  })

  it('does not infer evidence for null or absent provenance', () => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[event]} primaryStatus="available" comparisonStatus="available"
      primaryDetectorMode={null} onSelect={vi.fn()}
    />)
    expect(markup).not.toContain('class="maneuver-evidence"')
    expect(markup).not.toContain('About maneuver evidence')
  })

  it('provides an accessible icon controlling a native dismissible popover with the exact approved copy', () => {
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[]} primaryStatus="available" primaryDetectorMode="HIGH" onSelect={vi.fn()}
    />)
    const control = markup.match(/<button[^>]*aria-label="About maneuver evidence"[^>]*>.*?<\/button>/)?.[0]
    expect(control).toBeDefined()
    expect(control).toContain('type="button"')
    expect(control).toContain('aria-expanded="false"')
    const helpId = control!.match(/aria-controls="([^"]+)"/)![1]
    expect(control).toContain(`popoverTarget="${helpId}"`)
    expect(control).toContain('aria-hidden="true"')
    expect(control).toContain('focusable="false"')
    expect(control).not.toContain('(i)')
    expect(markup).toContain(`id="${helpId}" class="maneuver-evidence__help" popover="auto" role="note" aria-labelledby="${helpId}-title"`)
    const paragraphs = [...markup.matchAll(/<p(?: class="maneuver-evidence__secondary")?>(.*?)<\/p>/g)]
      .map((match) => match[1].replace(/<[^>]+>/g, ''))
    expect(markup).toContain(`<h3 id="${helpId}-title">Maneuver detection evidence</h3>`)
    expect(paragraphs.slice(0, 4)).toEqual([
      'HIGH evidence: Detection based on heading (HDG), with supporting signals such as heel (HEEL), course (COG), and speed (SOG) when available.',
      'LOW evidence: Detection based on course (COG) and speed (SOG).',
      'HIGH uses richer telemetry, but neither level guarantees detection accuracy or indicates overall track quality.',
      'ΔHDG = heading change · ΔCOG = course change',
    ])
    expect(markup.match(/class="maneuver-evidence__secondary"/g)).toHaveLength(2)
  })

  it('labels mixed HIGH/LOW angles and preserves LOW row navigation', () => {
    const low: DisplayManeuver = {
      ...event,
      activityRole: 'comparison',
      maneuver: {
        ...event.maneuver,
        heading_change_deg: null,
        course_change_deg: 85.4,
        peak_turn_rate_deg_s: null,
        peak_turn_rate_time: null,
        recovery_time_s: null,
      },
    }
    const onSelect = vi.fn()
    const markup = renderToStaticMarkup(<ManeuverEventTable
      events={[low, event]} primaryStatus="available" comparisonStatus="available" onSelect={onSelect}
    />)
    expect(markup).toContain('ΔHDG −91')
    expect(markup).toContain('ΔCOG +85')
    expect(markup).toContain('Move replay to 08:47:59 UTC, Activity C')
    const row = ManeuverEventRow({ event: low, selected: true, onSelect })
    row.props.onClick()
    expect(onSelect).toHaveBeenCalledWith(low)
    expect(sortManeuverEvents([low, event], 'desc')).toEqual([event, low])
  })
  it('starts collapsed with its header visible', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[event]}
        primaryStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Time')
    expect(markup).toContain('Act')
    expect(markup).toContain('Δ (°)')
    expect(markup).toContain('08:47:59')
    expect(markup).toContain('−91')
    expect(markup).toContain('Move replay to 08:47:59 UTC, Activity P')
    expect(markup).toContain('Maneuvers')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('Expand')
    expect(markup).toContain('hidden=""')
  })

  it('retains compact columns, default ASC sorting, and event actions when expanded', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[event]}
        primaryStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Time')
    expect(markup).toContain('Act')
    expect(markup).toContain('\u0394 (\u00b0)')
    expect(markup).toContain('08:47:59')
    expect(markup).toContain('\u221291')
    expect(markup).toContain('Move replay to 08:47:59 UTC, Activity P')
    expect(markup).toContain('aria-sort="ascending"')
    expect(markup).toContain('Time ASC')
    expect(cellTexts(markup, 'th')).toEqual([
      'Time ASC',
      'Act',
      'Loss (m)',
      'Loss (s)',
      'Rec (s)',
      'SOG in',
      'SOG min',
      'SOG out',
      'Δ (°)',
      'Dur (s)',
    ])
    expect(cellTexts(markup, 'td')).toEqual([
      '08:47:59',
      'P',
      '9',
      '3',
      '12',
      '5.2',
      '3.1',
      '5.1',
      'ΔHDG −91',
      '10',
    ])
    expect(markup).toMatch(
      /maneuver-event-table__time-column.*maneuver-event-table__activity-column.*maneuver-event-table__loss-column.*span="2".*maneuver-event-table__recovery-column.*maneuver-event-table__sog-column.*span="3".*maneuver-event-table__heading-column.*maneuver-event-table__duration-column/,
    )
  })

  it('can expand and collapse again without selecting an event', () => {
    const onSelect = vi.fn()

    const expanded = toggledExpandedState(false)
    const collapsedAgain = toggledExpandedState(expanded)

    expect(expanded).toBe(true)
    expect(collapsedAgain).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('sorts ascending by default and can reverse by centerTimeMs', () => {
    const early = eventAt(Date.parse('2031-06-15T08:01:00Z'))
    const late = eventAt(Date.parse('2031-06-15T08:09:00Z'))
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[late, early]}
        primaryStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup.indexOf('08:01:00')).toBeLessThan(markup.indexOf('08:09:00'))
    expect(toggledSortDirection('asc')).toBe('desc')
    expect(sortManeuverEvents([early, late], 'desc')).toEqual([late, early])
  })

  it('uses centerTimeMs and keeps equal-time P/C attribution deterministic', () => {
    const centerTimeMs = Date.parse('2031-06-15T08:05:00Z')
    const primary = eventAt(centerTimeMs, 'primary')
    const comparison = eventAt(centerTimeMs, 'comparison')
    primary.maneuver.center_time = '2031-06-15T09:30:00Z'

    const descending = sortManeuverEvents(
      [comparison, eventAt(centerTimeMs + 1_000), primary],
      'desc',
    )

    expect(descending.map((item) => item.centerTimeMs)).toEqual([
      centerTimeMs + 1_000,
      centerTimeMs,
      centerTimeMs,
    ])
    expect(descending.slice(1).map((item) => item.activityRole)).toEqual([
      'primary',
      'comparison',
    ])
  })

  it('selects a row explicitly and exposes its center for replay navigation', () => {
    let selectedKey: string | null = null
    let playbackTime = 0
    const onSelect = vi.fn((selectedEvent: DisplayManeuver) => {
      selectedKey = maneuverSelectionKey(selectedEvent)
      playbackTime = selectedEvent.centerTimeMs
    })
    const row = ManeuverEventRow({
      event,
      selected: false,
      onSelect,
    }) as ReactElement<{
      onClick: () => void
    }>

    row.props.onClick()

    expect(onSelect).toHaveBeenCalledWith(event)
    expect(selectedKey).toBe(maneuverSelectionKey(event))
    expect(playbackTime).toBe(event.centerTimeMs)
  })

  it('marks only the explicitly selected P/C event at an equal time', () => {
    const centerTimeMs = Date.parse('2031-06-15T08:05:00Z')
    const primary = eventAt(centerTimeMs, 'primary')
    const comparison = eventAt(centerTimeMs, 'comparison')
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[primary, comparison]}
        primaryStatus="available"
        comparisonStatus="available"
        selectedManeuverKey={maneuverSelectionKey(comparison)}
        onSelect={() => undefined}
      />,
    )

    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(markup).toContain(
      'maneuver-event-table__row--selected maneuver-event-table__row--comparison',
    )
    expect(markup).not.toContain(
      'maneuver-event-table__row--selected maneuver-event-table__row--primary',
    )
  })

  it('moves the highlight to a second selection and keeps identity through sorting', () => {
    const early = eventAt(Date.parse('2031-06-15T08:01:00Z'))
    const late = eventAt(Date.parse('2031-06-15T08:09:00Z'))
    const selectedRow = (markup: string) => markup.match(
      /<tr class="[^"]*maneuver-event-table__row--selected[^"]*"[^>]*>.*?<\/tr>/,
    )?.[0]
    const lateSelected = renderToStaticMarkup(
      <ManeuverEventTable
        events={[late, early]}
        primaryStatus="available"
        selectedManeuverKey={maneuverSelectionKey(late)}
        onSelect={() => undefined}
      />,
    )
    const earlySelected = renderToStaticMarkup(
      <ManeuverEventTable
        events={[late, early]}
        primaryStatus="available"
        selectedManeuverKey={maneuverSelectionKey(early)}
        onSelect={() => undefined}
      />,
    )

    expect(selectedRow(lateSelected)).toContain('08:09:00')
    expect(selectedRow(earlySelected)).toContain('08:01:00')
    expect(sortManeuverEvents([late, early], 'asc').find(
      (item) => maneuverSelectionKey(item) === maneuverSelectionKey(late),
    )).toBe(late)
    expect(sortManeuverEvents([late, early], 'desc').find(
      (item) => maneuverSelectionKey(item) === maneuverSelectionKey(early),
    )).toBe(early)
  })

  it('does not highlight an event without an explicit selection key', () => {
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[event]}
        primaryStatus="available"
        selectedManeuverKey={null}
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('aria-selected="false"')
    expect(markup).not.toContain('maneuver-event-table__row--selected')
  })

  it('renders unavailable optional metrics as em dashes', () => {
    const unavailable = {
      ...event,
      maneuver: {
        ...event.maneuver,
        sog_entry_kn: null,
        sog_min_kn: null,
        sog_exit_kn: null,
        recovery_time_s: null,
        speed_loss_distance_m: null,
        speed_loss_time_s: null,
      },
    }
    const markup = renderToStaticMarkup(
      <ManeuverEventTable
        events={[unavailable]}
        primaryStatus="available"
        onSelect={() => undefined}
      />,
    )

    expect(markup.match(/—/g)).toHaveLength(6)
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
