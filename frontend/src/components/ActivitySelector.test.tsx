import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SessionActivity } from '../types/session'
import ActivitySelector from './ActivitySelector'

const emailActivity: SessionActivity = {
  id: 'activity-full-id',
  source: 'vakaros',
  device_name: 'device',
  original_filename: 'track.csv.gz',
  start_time: '2031-06-15T08:03:00Z',
  end_time: '2031-06-15T10:42:00Z',
  sample_count: 100,
  sailor: { id: 'sailor-1', name: null, email: 'maxi+vakaros@example.com' },
  boat: null,
}

describe('ActivitySelector', () => {
  it('shortens email-derived labels without changing the Activity option value or time range', () => {
    const markup = renderToStaticMarkup(
      <ActivitySelector
        label="My track"
        activities={[emailActivity]}
        selectedId={emailActivity.id}
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('value="activity-full-id"')
    expect(markup).toContain('maxi+vakaros@ · 08:03–10:42</option>')
  })
})
