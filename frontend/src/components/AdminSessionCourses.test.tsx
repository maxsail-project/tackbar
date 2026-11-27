// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/adminApi'
import AdminSessionCourses from './AdminSessionCourses'

vi.mock('../api/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/adminApi')>(),
  listSessionCourses: vi.fn(),
  detachSessionCourse: vi.fn(),
  updateSessionCourseRaceTimes: vi.fn(),
  suggestAttachedCourseGun: vi.fn(),
}))

const course = {
  course_id: 'c-1', available: true, race_label: 'Race 1 - Group D',
  time_range: { from: '2026-11-19T19:05:00Z', to: '2026-11-19T20:02:11Z' }, gun_utc: '2026-11-19T19:10:00Z', end_utc: null,
  source_filename: 'Race 1 - Group D_elements.gpx', imported_at: '2026-11-27T10:00:00Z', element_count: 8,
}
let container: HTMLDivElement
let root: Root
const confirm = vi.fn(() => true)
const onUnauthorized = vi.fn()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.mocked(api.listSessionCourses).mockResolvedValue({ courses: [
    course,
    { ...course, course_id: 'c-2', available: false, race_label: null, time_range: null, gun_utc: null, source_filename: null },
  ] })
  vi.mocked(api.detachSessionCourse).mockResolvedValue({ courses: [] })
  confirm.mockReturnValue(true)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks() })

async function render() {
  await act(async () => root.render(<AdminSessionCourses adminKey="key" sessionId="session-1" onUnauthorized={onUnauthorized} confirm={confirm} />))
}
const detachButtons = () => [...container.querySelectorAll<HTMLButtonElement>('button')].filter((item) => item.textContent === 'Detach')

describe('Admin Session courses', () => {
  it('lists attached courses with race label, UTC range, gun and source filename', async () => {
    await render()
    expect(api.listSessionCourses).toHaveBeenCalledWith('key', 'session-1')
    expect(container.textContent).toContain('Race 1 - Group D')
    expect(container.textContent).toContain('2026-11-19 19:05:00–20:02:11 UTC · Gun 19:10:00 UTC')
    expect(container.textContent).toContain('Source: Race 1 - Group D_elements.gpx')
    expect(container.textContent).toContain('Course file unavailable')
    expect(detachButtons().every((item) => item.className === 'danger')).toBe(true)
  })

  it('detaches only after confirmation', async () => {
    await render()
    confirm.mockReturnValueOnce(false)
    await act(async () => detachButtons()[0].click())
    expect(api.detachSessionCourse).not.toHaveBeenCalled()
    await act(async () => detachButtons()[0].click())
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Detach Race 1 - Group D from the Session?'))
    expect(api.detachSessionCourse).toHaveBeenCalledWith('key', 'session-1', 'c-1')
    expect(container.textContent).toContain('No course attached.')
  })

  it('reports unauthorized access to the Admin page', async () => {
    vi.mocked(api.listSessionCourses).mockRejectedValueOnce(new api.AdminApiError(401))
    await render()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Attached courses could not be loaded.')
  })
})

describe('Admin attached course race times (#242 D14)', () => {
  const NOTE = 'Copied to the gun field — adjust to the official gun if needed'
  const originalTz = process.env.TZ
  const suggestion = {
    gun_utc: '2026-11-19T19:10:12Z', crossing_utc: '2026-11-19T19:10:11.600Z', activity_id: 'a-1', basis: 'earliest_start_line_crossing' as const,
  }
  afterEach(() => { process.env.TZ = originalTz; vi.unstubAllGlobals() })

  const button = (label: string) => {
    const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)
    if (!found) throw new Error(`No button ${label}`)
    return found
  }
  const field = (label: string) => [...container.querySelectorAll('label')]
    .find((item) => item.textContent?.startsWith(label))!.querySelector('input')!
  const press = async (label: string) => { await act(async () => button(label).click()) }
  async function type(label: string, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(label), value)
      field(label).dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  async function openEditor() {
    await render()
    await press('Edit times')
  }
  const saved = (gun_utc: string | null, end_utc: string | null) => {
    vi.mocked(api.updateSessionCourseRaceTimes).mockResolvedValue({ courses: [{ ...course, gun_utc, end_utc }] })
  }

  it('offers Edit times only for readable courses and prefills the UTC values', async () => {
    await openEditor()
    expect([...container.querySelectorAll('button')].filter((item) => item.textContent === 'Edit times')).toHaveLength(0)
    expect(field('Gun (UTC').value).toBe('2026-11-19 19:10:00')
    expect(field('Race end (UTC').value).toBe('')
    expect(container.querySelector('form')!.textContent).toContain('Times are UTC, within 2026-11-19 19:05:00–20:02:11 UTC.')
  })

  it.each(['UTC', 'Pacific/Auckland', 'America/Sao_Paulo'])('saves the fields as UTC with the browser in %s and refreshes the list', async (zone) => {
    process.env.TZ = zone
    await openEditor()
    expect(field('Gun (UTC').value).toBe('2026-11-19 19:10:00')
    await type('Gun (UTC', '2026-11-19 19:12:00')
    await type('Race end (UTC', '2026-11-19T19:50')
    saved('2026-11-19T19:12:00Z', '2026-11-19T19:50:00Z')
    await press('Save')
    expect(api.updateSessionCourseRaceTimes).toHaveBeenCalledWith('key', 'session-1', 'c-1', {
      gun_utc: '2026-11-19T19:12:00Z', end_utc: '2026-11-19T19:50:00Z',
    })
    expect(container.querySelector('form')).toBeNull()
    expect(container.textContent).toContain('Race 1 - Group D')
    expect(container.textContent).toContain('Gun 19:12:00 UTC · End 19:50:00 UTC')
  })

  it('clears a time when its field is emptied', async () => {
    await openEditor()
    await type('Gun (UTC', '')
    saved(null, null)
    await press('Save')
    expect(api.updateSessionCourseRaceTimes).toHaveBeenCalledWith('key', 'session-1', 'c-1', { gun_utc: null, end_utc: null })
    expect(container.textContent).not.toContain('Gun 19:10:00 UTC')
  })

  it('rejects an unreadable time without calling the backend', async () => {
    await openEditor()
    await type('Gun (UTC', '19:12')
    await type('Race end (UTC', '2026-02-30 10:00')
    await press('Save')
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Enter the gun as YYYY-MM-DD HH:MM:SS UTC.')
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Enter the race end as YYYY-MM-DD HH:MM:SS UTC.')
    expect(api.updateSessionCourseRaceTimes).not.toHaveBeenCalled()
  })

  it('Use as gun only copies into the editable field; Save persists the adjusted value', async () => {
    vi.mocked(api.suggestAttachedCourseGun).mockResolvedValue({ suggestion })
    await openEditor()
    expect(container.textContent).not.toContain(NOTE)
    await press('Suggest gun')
    expect(api.suggestAttachedCourseGun).toHaveBeenCalledWith('key', 'session-1', 'c-1')
    expect(container.textContent).toContain('Suggested gun: 2026-11-19 19:10:12 UTC')
    expect(field('Gun (UTC').value).toBe('2026-11-19 19:10:00')
    await press('Use as gun')
    expect(field('Gun (UTC').value).toBe('2026-11-19 19:10:12')
    expect(container.querySelector('.admin-course-suggestion')!.textContent).toContain(NOTE)
    expect(api.updateSessionCourseRaceTimes).not.toHaveBeenCalled()
    await type('Gun (UTC', '2026-11-19 19:10:00')
    saved('2026-11-19T19:10:00Z', null)
    await press('Save')
    expect(api.updateSessionCourseRaceTimes).toHaveBeenCalledTimes(1)
    expect(api.updateSessionCourseRaceTimes).toHaveBeenCalledWith('key', 'session-1', 'c-1', { gun_utc: '2026-11-19T19:10:00Z', end_utc: null })
  })

  it('drops the copied note for a new suggestion and reports none or an error', async () => {
    vi.mocked(api.suggestAttachedCourseGun).mockResolvedValueOnce({ suggestion })
    await openEditor()
    await press('Suggest gun')
    await press('Use as gun')
    vi.mocked(api.suggestAttachedCourseGun).mockResolvedValueOnce({ suggestion: { ...suggestion } })
    await press('Suggest gun')
    expect(container.textContent).not.toContain(NOTE)
    vi.mocked(api.suggestAttachedCourseGun).mockResolvedValueOnce({ suggestion: null })
    await press('Suggest gun')
    expect(container.textContent).toContain('No start-line crossing was found in the course time range.')
    vi.mocked(api.suggestAttachedCourseGun).mockRejectedValueOnce(new api.AdminApiError(422, undefined, 'The course has no start line'))
    await press('Suggest gun')
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('The course has no start line')
  })

  it('shows 422 errors readably and keeps the edited values', async () => {
    vi.mocked(api.updateSessionCourseRaceTimes).mockRejectedValueOnce(new api.AdminApiError(422, undefined, [
      { loc: ['body', 'race'], msg: 'Value error, end_utc must be after gun_utc', type: 'value_error' },
    ]))
    await openEditor()
    await type('Race end (UTC', '2026-11-19 19:06:00')
    await press('Save')
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('The times were not saved:race: end_utc must be after gun_utc')
    expect(field('Race end (UTC').value).toBe('2026-11-19 19:06:00')
    expect(button('Save').disabled).toBe(false)
  })

  it.each([
    [404, 'The course is no longer attached to this Session. Refresh and try again.'],
    [409, 'The course file is unavailable.'],
    [401, 'The race times could not be saved. Try again.'],
  ])('reports a %s save failure', async (status, message) => {
    vi.mocked(api.updateSessionCourseRaceTimes).mockRejectedValueOnce(new api.AdminApiError(status))
    await openEditor()
    await press('Save')
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(message)
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })

  it('Cancel saves nothing and leaves the values', async () => {
    await openEditor()
    await type('Gun (UTC', '2026-11-19 19:30:00')
    await press('Cancel')
    expect(api.updateSessionCourseRaceTimes).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Gun 19:10:00 UTC')
    await press('Edit times')
    expect(field('Gun (UTC').value).toBe('2026-11-19 19:10:00')
  })

  it('sends the edit as an authorized PATCH and the suggestion as a POST', async () => {
    const actual = await vi.importActual<typeof import('../api/adminApi')>('../api/adminApi')
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ courses: [], suggestion: null }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await actual.updateSessionCourseRaceTimes('key', 's 1', 'c-1', { gun_utc: null, end_utc: null })
    await actual.suggestAttachedCourseGun('key', 's 1', 'c-1')
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/api/admin/sessions/s%201/courses/c-1/race-times', 'PATCH', '{"gun_utc":null,"end_utc":null}'],
      ['/api/admin/sessions/s%201/courses/c-1/gun-suggestion', 'POST', undefined],
    ])
    expect(calls[0][1].headers).toMatchObject({ 'X-TackBar-Admin-Key': 'key', 'Content-Type': 'application/json' })
  })
})
