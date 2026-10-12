import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import MetricSelector, {
  DEFAULT_VIEWER_METRIC_VIEW,
  VIEWER_METRIC_VIEWS,
} from './MetricSelector'

describe('Viewer metric/view selector', () => {
  it('puts VS first and defines it as the default Viewer mode', () => {
    expect(VIEWER_METRIC_VIEWS).toEqual(['VS', 'SOG', 'COG', 'HEEL', 'TRIM'])
    expect(DEFAULT_VIEWER_METRIC_VIEW).toBe('VS')
  })

  it('renders VS and all four existing selectable metric views', () => {
    const markup = renderToStaticMarkup(
      <MetricSelector selectedMetric="VS" onChange={vi.fn()} />,
    )

    expect(markup.match(/<button/g)).toHaveLength(5)
    expect(markup.indexOf('>VS<')).toBeLessThan(markup.indexOf('>SOG<'))
    expect(markup).toContain('>COG<')
    expect(markup).toContain('>HEEL<')
    expect(markup).toContain('>TRIM<')
    expect(markup).toContain('aria-pressed="true"')
  })

  it('can present an existing metric as selected after leaving VS', () => {
    const markup = renderToStaticMarkup(
      <MetricSelector selectedMetric="SOG" onChange={vi.fn()} />,
    )

    expect(markup).toContain('class="is-active" aria-pressed="true" title="SOG time-series metric"')
  })
})
