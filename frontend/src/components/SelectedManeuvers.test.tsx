import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import SelectedManeuvers from './SelectedManeuvers'

const centerTimeMs = Date.UTC(2031, 0, 1, 10, 0, 5)

function event(role: DisplayManeuver['activityRole'], overrides: Partial<DisplayManeuver['maneuver']> = {}): DisplayManeuver {
  return {
    activityRole: role,
    centerTimeMs,
    maneuver: {
      start_time: '2031-01-01T10:00:00Z',
      center_time: '2031-01-01T10:00:05Z',
      end_time: '2031-01-01T10:00:10Z',
      speed_loss_distance_m: 8.4,
      speed_loss_time_s: 3.2,
      recovery_time_s: 11.7,
      sog_entry_kn: 5.1,
      sog_min_kn: 3.2,
      sog_exit_kn: 5.4,
      heading_change_deg: 89.6,
      course_change_deg: null,
      peak_turn_rate_deg_s: null,
      peak_turn_rate_time: null,
      duration_s: 10,
      ...overrides,
    },
  }
}

describe('Selected Maneuvers strip', () => {
  it('reserves two accessible records and a keyboard-scrollable metric area when empty', () => {
    const markup = renderToStaticMarkup(<SelectedManeuvers current={null} previous={null} />)
    expect(markup).toContain('Selected Maneuvers</h2>')
    expect(markup).toContain('No latest selection')
    expect(markup).toContain('No previous selection')
    expect(markup.match(/role="listitem"/g)).toHaveLength(2)
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('scroll horizontally')
  })

  it('shows P/C colors and all individual values in table order', () => {
    const markup = renderToStaticMarkup(<SelectedManeuvers
      current={event('comparison', { heading_change_deg: null, course_change_deg: -91.2 })}
      previous={event('primary')}
    />)
    expect(markup).toContain('color:#9a5aaf')
    expect(markup).toContain('color:#168097')
    expect(markup).toContain('Latest selected maneuver, C')
    expect(markup).toContain('Previous selected maneuver, P')
    const row = markup.match(/class="selected-maneuvers__record" role="listitem">(.*?)<\/div>/)?.[1] ?? ''
    expect(row).toMatch(/10:00:05 UTC.*Loss 8 m \/ 3 s.*Rec 12 s.*SOG 5\.1 \/ 3\.2 \/ 5\.4 kn.*ΔCOG −91°.*Dur 10 s/)
    expect(markup).toContain('ΔHDG +90°')
    expect(markup).not.toContain('HIGH')
    expect(markup).not.toContain('LOW')
  })

  it('keeps unavailable values unavailable without invented units', () => {
    const markup = renderToStaticMarkup(<SelectedManeuvers
      current={event('primary', {
        speed_loss_distance_m: null,
        speed_loss_time_s: null,
        recovery_time_s: null,
        sog_entry_kn: null,
        sog_min_kn: null,
        sog_exit_kn: null,
        heading_change_deg: null,
      })}
      previous={null}
    />)
    expect(markup).toContain('Loss — / —')
    expect(markup).toContain('Rec —')
    expect(markup).toContain('SOG — / — / — kn')
    expect(markup).toContain('Dur 10 s')
    expect(markup).not.toContain('— m')
    expect(markup).not.toContain('— s')
    expect(markup).toContain('No previous selection')
  })
})
