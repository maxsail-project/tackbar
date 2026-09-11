import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SharedSessionUnavailable } from './SessionViewerPage'
import { formatSessionDuration } from '../utils/sessionPresentation'

describe('unavailable shared Session', () => {
  it('shows a generic unavailable state without internal identifiers', () => {
    const markup = renderToStaticMarkup(<SharedSessionUnavailable />)

    expect(markup).toContain('Session not found')
    expect(markup).toContain('shared link is unavailable')
    expect(markup).not.toContain('session_id')
    expect(markup).not.toContain('capability')
  })
})

describe('Session summary presentation', () => {
  it('formats canonical sailing duration compactly', () => {
    expect(formatSessionDuration('2026-09-05T11:49:00Z', '2026-09-05T15:21:00Z')).toBe('3h 32m')
    expect(formatSessionDuration('2026-09-05T11:49:00Z', '2026-09-05T12:37:00Z')).toBe('48m')
  })

  it('counts unique Sailors rather than Activities', () => {
    const activities = [
      { sailor: { id: 'sailor-a' } },
      { sailor: { id: 'sailor-a' } },
      { sailor: { id: 'sailor-b' } },
    ]
    expect(new Set(activities.map((activity) => activity.sailor.id)).size).toBe(2)
  })
})
