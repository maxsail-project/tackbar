import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
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
  it('reserves two aligned rows under shared accessible metric headers when empty', () => {
    const markup = renderToStaticMarkup(<SelectedManeuvers current={null} previous={null} />)
    expect(markup).toContain('<strong id="selected-maneuvers-title">MANEUVERS</strong>')
    expect(markup).not.toContain('<h2')
    expect(markup).toContain('<table class="selected-maneuvers__table"')
    expect(markup.match(/scope="col"/g)).toHaveLength(6)
    expect(markup.match(/scope="row"/g)).toHaveLength(2)
    expect(markup).toContain('aria-label="Maneuver UTC time"')
    expect(markup).toContain('>Loss</th>')
    expect(markup).toContain('>Rec</th>')
    expect(markup).toContain('>SOG (in/min/out)</th>')
    expect(markup).toContain('>Δ (°)</th>')
    expect(markup).toContain('No latest selection')
    expect(markup).toContain('No previous selection')
    expect(markup.match(/colSpan="5"/g) ?? markup.match(/colspan="5"/g)).toHaveLength(2)
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
    const row = markup.match(/<tbody><tr>(.*?)<\/tr>/)?.[1] ?? ''
    expect(row).toMatch(/10:00:05.*8 m\/3 s.*12 s.*5\.1\/3\.2\/5\.4 kt.*−91°/)
    expect(markup).toContain('+90°')
    expect(markup).toContain('Entry SOG 5.1 knots, Minimum SOG 3.2 knots, Exit SOG 5.4 knots')
    expect(markup).not.toMatch(/ΔHDG|ΔCOG|DUR/)
    expect(row).not.toContain('Loss 8 m')
    expect(row).not.toContain('Rec 12 s')
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
    expect(markup).toContain('>—/—</td>')
    expect(markup).toContain('>—</td>')
    expect(markup).toContain('>—/—/—</td>')
    expect(markup).toContain('Entry SOG —, Minimum SOG —, Exit SOG —')
    expect(markup).toContain('aria-label="Direction change —"')
    expect(markup).not.toContain('— m')
    expect(markup).not.toContain('— s')
    expect(markup).not.toContain('—kt')
    expect(markup).not.toContain('— knots')
    expect(markup).not.toContain('—/—/— kt')
    expect(markup).toContain('No previous selection')
  })

  it('uses one unit for a partly unavailable SOG triplet', () => {
    const markup = renderToStaticMarkup(<SelectedManeuvers
      current={event('primary', { sog_entry_kn: null, sog_min_kn: 4.2, sog_exit_kn: null })}
      previous={null}
    />)
    expect(markup).toContain('>—/4.2/— kt</td>')
    expect(markup).toContain('Entry SOG —, Minimum SOG 4.2 knots, Exit SOG —')
  })

  it('keeps all columns visible in compact single-line rows without scrolling', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const section = css.slice(css.indexOf('.selected-maneuvers {'), css.indexOf('.section-heading {'))
    expect(section).toContain('table-layout: fixed')
    expect(section).toContain('height: 22px')
    expect(section).toContain('white-space: nowrap')
    expect(section).toContain('width: 100%')
    expect(section).toContain('.selected-maneuvers__time { width: 65px; }')
    expect(section).not.toMatch(/overflow-x|scrollbar-width|width: max-content/)
    expect(section).toContain('.selected-maneuvers__sog { width: 118px; }')
    expect(section).toContain('.selected-maneuvers__sog { width: 115px; }')
    expect(section).not.toContain('display: none')
  })
})
