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
}))

const course = {
  course_id: 'c-1', available: true, race_label: 'Race 1 - Group D',
  time_range: { from: '2026-11-19T19:05:00Z', to: '2026-11-19T20:02:11Z' }, gun_utc: '2026-11-19T19:10:00Z',
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
