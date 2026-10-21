import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../App'
import { getPersonalTackBar, PersonalTackBarNotFoundError } from '../api/tackbarApi'
import type { PersonalTackBar } from '../types/personal'
import PersonalTackBarPage, {
  filterPersonalSessions,
  PersonalTackBarContent,
} from './PersonalTackBarPage'

const data: PersonalTackBar = {
  email: 'sailor@example.com', name: 'Test Sailor', session_count: 2, last_sailing_end: '2026-09-05T17:21:00Z',
  sessions: [
    { sailing_start: '2026-09-05T13:49:00Z', sailing_end: '2026-09-05T17:21:00Z', sailor_count: 2, location_label: 'Mahón', location_country: 'Spain', weather: { wind_direction_10m_deg: 91.6, wind_speed_10m_kn: 4.2, air_temperature_c: 23 }, session_path: '/s/shared-session-token' },
    { sailing_start: '2026-09-04T17:24:00Z', sailing_end: '2026-09-04T20:14:00Z', sailor_count: 3, location_label: null, location_country: null, weather: null, session_path: null },
  ],
}
const render = (value: PersonalTackBar) => renderToStaticMarkup(<MemoryRouter><PersonalTackBarContent state={{ status: 'ready', data: value }} /></MemoryRouter>)

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Personal TackBar / My Sessions', () => {
  it('shows the available release identity below the logo in the personal header', () => {
    vi.stubEnv('VITE_APP_RELEASE_FAMILY', 'Californian')
    vi.stubEnv('VITE_APP_VERSION', 'v0.7.12')
    const markup = render(data)
    expect(markup).toMatch(/alt="TackBar"[^>]*><span class="public-header-release">Californian · v0\.7\.12<\/span>/)
    expect(markup).toContain('>About</button>')
  })

  it('loads the minimal personal API and renders summary and returned history', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))
    vi.stubGlobal('fetch', fetchMock)
    const loaded = await getPersonalTackBar('personal-token')
    const markup = render(loaded)
    expect(fetchMock).toHaveBeenCalledWith('/api/me/personal-token', expect.objectContaining({ method: 'GET' }))
    expect(markup).toContain('<h1 id="my-sessions-heading">My Sessions</h1>')
    expect(markup.match(/My Sessions/g)).toHaveLength(1)
    expect(markup).not.toContain('My TackBar')
    expect(markup).toMatch(/<header[^>]*><div class="public-header-brand"><img[^>]*alt="TackBar"/)
    expect(markup).toContain('>About</button>')
    expect(markup).not.toContain('public-header-release')
    expect(markup).toContain('sailor@example.com - Test Sailor</p><p>2 Sessions</p>')
    expect(markup).toContain('2 Sessions')
    expect(markup).not.toContain('Last sailing')
    expect(markup.indexOf('2026-09-05T13:49:00Z')).toBeLessThan(markup.indexOf('2026-09-04T17:24:00Z'))
    expect(markup).toContain('2 sailors')
    expect(markup).toContain('3 sailors')
    expect(markup).toContain('Mahón · ')
    expect(markup).not.toContain('Mahón, Spain')
    expect(markup).toContain('092° · 4.2 kt · 23 °C')
    expect(markup.match(/personal-session__weather/g)).toHaveLength(1)
    expect(markup).toMatch(/<\/time>–<time[^>]*>[^<]*<\/time> · 2 sailors/)
    expect(markup).not.toContain('Gust')
    expect(markup).not.toContain('Cloud')
    expect(markup).not.toContain('Source')
    for (const unwanted of ['consent', 'Activities', 'Expires', 'Available', 'personal-token']) expect(markup).not.toContain(unwanted)
  })

  it('keeps date and time identity when location is unavailable', () => {
    const markup = render(data)
    expect(markup).toContain('2026-09-04T17:24:00Z')
    expect(markup).not.toContain('null ·')
    expect(markup).not.toContain('undefined ·')
  })

  it('uses country when city is empty and searches the displayed location', () => {
    const countryOnly = { ...data.sessions[1], location_label: '  ', location_country: ' Spain ' }
    const history = [data.sessions[0], countryOnly]
    const markup = render({ ...data, sessions: history })
    expect(markup).toContain('Spain · ')
    expect(markup).not.toContain('Mahón, Spain')
    expect(filterPersonalSessions(history, 'spain')).toEqual([countryOnly])
    expect(filterPersonalSessions(history, 'mahón')).toEqual([data.sessions[0]])
  })

  it('opens the existing Viewer from the available row and leaves unavailable history inert', async () => {
    const markup = render(data)
    expect(markup).toMatch(/<a[^>]*href="\/s\/shared-session-token"[^>]*><h2>/)
    expect(markup).toMatch(/<div[^>]*aria-disabled="true"[^>]*><h2>/)
    expect(markup).not.toContain('Open Session')
    expect(markup.match(/Session unavailable/g)).toHaveLength(1)
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/me/personal-token'] })
    expect(router.state.matches.at(-1)?.route.path).toBe('/me/:token')
    await router.navigate(data.sessions[0].session_path!)
    expect(router.state.matches.at(-1)?.route.path).toBe('/s/:token')
    expect(router.state.matches.at(-1)?.params.token).toBe('shared-session-token')
    router.dispose()
  })

  it('searches only location label and the displayed sailing date', () => {
    const displayedDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
      .format(new Date(data.sessions[0].sailing_start))
    expect(filterPersonalSessions(data.sessions, 'mahon')).toEqual([data.sessions[0]])
    expect(filterPersonalSessions(data.sessions, 'MAHÓN')).toEqual([data.sessions[0]])
    expect(filterPersonalSessions(data.sessions, displayedDate)).toEqual([data.sessions[0]])
    expect(filterPersonalSessions(data.sessions, '2026-09-05')).toEqual([data.sessions[0]])
    for (const excluded of ['4.2 kt', '2 sailors', 'shared-session-token', '2026-09-05T13:49']) {
      expect(filterPersonalSessions(data.sessions, excluded)).toEqual([])
    }
    expect(render(data)).toContain('placeholder="Location or sailing date"')
  })

  it('keeps available-first API order when search matches both availability groups', () => {
    const sessions = [
      { ...data.sessions[0], location_label: null, location_country: 'Spain' },
      { ...data.sessions[0], sailing_start: '2026-09-03T13:49:00Z', sailing_end: '2026-09-03T17:21:00Z', location_label: null, location_country: 'Spain' },
      { ...data.sessions[1], sailing_start: '2026-09-06T13:49:00Z', sailing_end: '2026-09-06T17:21:00Z', location_country: 'Spain' },
      { ...data.sessions[1], location_country: 'Spain' },
    ]
    const matches = filterPersonalSessions(sessions, 'spain')
    expect(matches).toEqual(sessions)
    const markup = render({ ...data, session_count: 4, sessions: matches })
    const positions = matches.map((session) => markup.indexOf(`dateTime="${session.sailing_start}"`))
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(markup.match(/Session unavailable/g)).toHaveLength(2)
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
