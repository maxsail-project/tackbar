import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SharedSessionUnavailable } from './SessionViewerPage'

describe('unavailable shared Session', () => {
  it('shows a generic unavailable state without internal identifiers', () => {
    const markup = renderToStaticMarkup(<SharedSessionUnavailable />)

    expect(markup).toContain('Session not found')
    expect(markup).toContain('shared link is unavailable')
    expect(markup).not.toContain('session_id')
    expect(markup).not.toContain('capability')
  })
})
