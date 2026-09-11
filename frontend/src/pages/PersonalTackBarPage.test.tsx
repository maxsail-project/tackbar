import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../App'
import { getPersonalTackBar, PersonalTackBarNotFoundError } from '../api/tackbarApi'
import type { PersonalTackBar } from '../types/personal'
import PersonalTackBarPage, { PersonalTackBarContent } from './PersonalTackBarPage'

const data: PersonalTackBar = {
  email: 'sailor@example.com', name: 'Test Sailor', session_count: 2, last_sailing_end: '2026-09-05T17:21:00Z',
  sessions: [
    { sailing_start: '2026-09-05T13:49:00Z', sailing_end: '2026-09-05T17:21:00Z', sailor_count: 2, session_path: '/s/shared-session-token' },
    { sailing_start: '2026-09-04T17:24:00Z', sailing_end: '2026-09-04T20:14:00Z', sailor_count: 3, session_path: null },
  ],
}
const render = (value: PersonalTackBar) => renderToStaticMarkup(<MemoryRouter><PersonalTackBarContent state={{ status: 'ready', data: value }} /></MemoryRouter>)

afterEach(() => vi.unstubAllGlobals())

describe('Personal TackBar / My Sessions', () => {
  it('loads the minimal personal API and renders summary and newest-first history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await getPersonalTackBar('personal-token')
    const markup = render(loaded)
    expect(fetchMock).toHaveBeenCalledWith('/api/me/personal-token', expect.objectContaining({ method: 'GET' }))
    expect(markup).toContain('<h1 id="my-sessions-heading">My Sessions</h1>')
    expect(markup.match(/My Sessions/g)).toHaveLength(1)
    expect(markup).not.toContain('My TackBar')
    expect(markup).toMatch(/<header[^>]*><img[^>]*alt="TackBar"/)
    expect(markup).toContain('sailor@example.com - Test Sailor</p><p>2 Sessions</p>')
    expect(markup).toContain('2 Sessions')
    expect(markup).not.toContain('Last sailing')
    expect(markup.indexOf('2026-09-05T13:49:00Z')).toBeLessThan(markup.indexOf('2026-09-04T17:24:00Z'))
    expect(markup).toContain('2 sailors')
    expect(markup).toContain('3 sailors')
    for (const unwanted of ['consent', 'Activities', 'Expires', 'Available', 'personal-token']) expect(markup).not.toContain(unwanted)
  })

  it('offers exactly one shared Viewer link or disabled unavailable action per Session', async () => {
    const markup = render(data)
    expect(markup).toMatch(/<a[^>]*href="\/s\/shared-session-token"[^>]*>Open Session<\/a>/)
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Session unavailable<\/button>/)
    expect(markup.match(/Open Session/g)).toHaveLength(1)
    expect(markup.match(/Session unavailable/g)).toHaveLength(1)
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/me/personal-token'] })
    expect(router.state.matches.at(-1)?.route.path).toBe('/me/:token')
    await router.navigate(data.sessions[0].session_path!)
    expect(router.state.matches.at(-1)?.route.path).toBe('/s/:token')
    expect(router.state.matches.at(-1)?.params.token).toBe('shared-session-token')
    router.dispose()
  })

  it('shows loading and handles denied access without identifying a Sailor', async () => {
    expect(renderToStaticMarkup(<MemoryRouter><PersonalTackBarPage /></MemoryRouter>)).toContain('Loading My Sessions')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"Personal TackBar not found"}', { status: 404 })))
    await expect(getPersonalTackBar('invalid')).rejects.toBeInstanceOf(PersonalTackBarNotFoundError)
    const markup = renderToStaticMarkup(<PersonalTackBarContent state={{ status: 'unavailable' }} />)
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('This personal link is unavailable.')
    expect(markup).not.toContain('Test Sailor')
    expect(markup).not.toContain('sailor@example.com')
    expect(markup).not.toContain('personal-sessions')
  })

  it('handles network and malformed responses without rendering backend details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response('invalid json')))
    await expect(getPersonalTackBar('token')).rejects.toMatchObject({ status: null })
    await expect(getPersonalTackBar('token')).rejects.toThrow('invalid response')
    expect(renderToStaticMarkup(<PersonalTackBarContent state={{ status: 'error' }} />)).toContain('Cannot load My TackBar.')
  })

  it('keeps the identity and count with an empty history', () => {
    const markup = render({ email: data.email, name: null, session_count: 0, last_sailing_end: null, sessions: [] })
    expect(markup).toContain('sailor@example.com</p><p>0 Sessions</p>')
    expect(markup).toContain('No Sessions recorded yet.')
    expect(markup).not.toContain('Last sailing:')
    expect(markup).not.toContain('Open Session')
  })

  it.each([null, '', '   ', '\t\n'])('shows only email when name is %j', (name) => {
    const markup = render({ ...data, name })
    expect(markup).toContain('<p class="personal-name">sailor@example.com</p><p>2 Sessions</p>')
    expect(markup).not.toContain('sailor@example.com -')
    expect(markup).not.toContain('Last sailing')
  })

  it('trims surrounding whitespace from a usable name', () => {
    expect(render({ ...data, name: '  Test Sailor  ' })).toContain('sailor@example.com - Test Sailor</p>')
  })

  it('encodes the personal credential and supports cancellation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await getPersonalTackBar('token/with?reserved', controller.signal)
    expect(fetchMock).toHaveBeenCalledWith('/api/me/token%2Fwith%3Freserved', expect.objectContaining({ signal: controller.signal }))
  })
})
