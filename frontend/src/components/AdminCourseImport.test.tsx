// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/adminApi'
import type { ReviewedCourse } from '../types/course'
import AdminCourseImport from './AdminCourseImport'
import { courseDraftFixture } from './courseDraftFixture'

vi.mock('../api/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/adminApi')>(),
  createGeoRacingCourseDraft: vi.fn(),
  validateCourse: vi.fn(),
}))
vi.mock('./CourseMapPreview', () => ({
  default: ({ course, gunUtc }: { course: { elements: unknown[], start_line: unknown }, gunUtc: string | null }) =>
    <div data-preview data-elements={course.elements.length} data-start-line={course.start_line ? 'yes' : 'no'} data-gun={gunUtc ?? ''} />,
}))

let container: HTMLDivElement
let root: Root
const onUnauthorized = vi.fn()
const originalTz = process.env.TZ

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.mocked(api.createGeoRacingCourseDraft).mockResolvedValue(courseDraftFixture())
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals()
  process.env.TZ = originalTz
})

const query = <T extends Element>(selector: string) => container.querySelector<T>(selector)
const button = (label: string, scope: ParentNode = container) => {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === label)
  if (!found) throw new Error(`No button ${label}`)
  return found
}
const row = (label: string) => [...container.querySelectorAll<HTMLLIElement>('.admin-course-track')]
  .find((item) => item.querySelector('h3')?.textContent === label)!

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}
async function press(target: HTMLButtonElement) { await act(async () => target.click()) }
const labelled = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('label')].find((item) => item.textContent?.startsWith(text))!.querySelector('input, select') as HTMLInputElement

async function renderTool() {
  await act(async () => root.render(<AdminCourseImport adminKey="key" onUnauthorized={onUnauthorized} />))
}
async function upload(name = 'Synthetic Race 7_elements.gpx') {
  await renderTool()
  const input = query<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [new File(['<gpx/>'], name)], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => query<HTMLFormElement>('form[aria-label="Import GeoRacing course"]')!.requestSubmit())
}
async function validated(): Promise<ReviewedCourse> {
  vi.mocked(api.validateCourse).mockImplementation(async (_key, course) => ({ course: { ...course, course_id: 'c-1' } }))
  await press(button('Validate course'))
  return vi.mocked(api.validateCourse).mock.calls.at(-1)![1]
}

describe('Admin Courses tool', () => {
  it('uploads the raw GPX and shows one review row per track with flags', async () => {
    await upload()
    expect(api.createGeoRacingCourseDraft).toHaveBeenCalledWith('key', expect.any(File))
    expect(container.querySelectorAll('.admin-course-track')).toHaveLength(6)
    const spare = row('Spare 1')
    expect(spare.textContent).toContain('Duplicate of Start Pin')
    expect(labelled(spare, 'Role').value).toBe('ignored')
    expect(row('SPARE').textContent).toContain('Never moved')
    expect(row('Race committee').textContent).toContain('1800')
    expect(row('Race committee').textContent).toContain('10:00:00 – 11:00:00')
    expect(row('Race committee').textContent).toContain('from track name')
    expect(row('Start Pin').textContent).toContain('Relocation: 10:20:00–10:22:00 UTC')
    expect(labelled(container, 'Race label').value).toBe('Synthetic Race 7')
    expect(query('[data-preview]')?.getAttribute('data-elements')).toBe('4')
  })

  it('checks the .gpx suffix client-side without calling the backend', async () => {
    await upload('elements.gpx.gz')
    expect(api.createGeoRacingCourseDraft).not.toHaveBeenCalled()
    expect(query('[role="alert"]')?.textContent).toBe('Choose an uncompressed .gpx file.')
  })

  it.each([
    [413, undefined, 'The file exceeds the 16 MiB limit.'],
    [422, 'Course element track 1 requires timezone-aware timestamps', 'The file cannot be used as a GeoRacing elements GPX: Course element track 1 requires timezone-aware timestamps'],
    [401, undefined, 'Admin authorization failed.'],
  ])('shows the controlled %s draft error', async (status, detail, message) => {
    vi.mocked(api.createGeoRacingCourseDraft).mockRejectedValueOnce(new api.AdminApiError(status, undefined, detail))
    await upload()
    expect(query('[role="alert"]')?.textContent).toBe(message)
    expect(container.querySelectorAll('.admin-course-track')).toHaveLength(0)
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })

  it('applies role changes and gate id edits to the reviewed course', async () => {
    await upload()
    await choose(labelled(row('Start Pin'), 'Role') as unknown as HTMLSelectElement, 'ignored')
    await choose(labelled(row('Spare 1'), 'Role') as unknown as HTMLSelectElement, 'mark')
    await type(labelled(row('Gate A'), 'Gate id'), 'G1')
    const course = await validated()
    expect(course.start_line).toBeNull()
    expect(course.ignored_tracks).toContainEqual({ label: 'Start Pin', reason: 'admin_ignored' })
    expect(course.elements.find((element) => element.id === 'spare_1')).toMatchObject({ role: 'mark', gate: null })
    expect(course.elements.find((element) => element.id === 'gate_a')?.gate).toBe('G1')
  })

  it('trims, splits and deletes stable intervals', async () => {
    await upload()
    const pin = row('Start Pin')
    const [first, second] = pin.querySelectorAll<HTMLLIElement>('.admin-course-interval')
    await press(button('Trim', first))
    await type(labelled(first, 'From'), '2031-03-14 09:58:00')
    await act(async () => first.querySelector('form')!.requestSubmit())
    expect(first.querySelector('[role="alert"]')?.textContent).toContain('within 10:00:00–10:20:00 UTC')
    await type(labelled(first, 'From'), '2031-03-14 10:01:00')
    await act(async () => first.querySelector('form')!.requestSubmit())
    await press(button('Delete', second))
    const trimmed = pin.querySelector<HTMLLIElement>('.admin-course-interval')!
    await press(button('Split', trimmed))
    await type(labelled(trimmed, 'Split at'), '2031-03-14 10:10:00')
    await act(async () => trimmed.querySelector('form')!.requestSubmit())
    const course = await validated()
    expect(course.elements.find((element) => element.id === 'start_pin')?.positions).toEqual([
      { from: '2031-03-14T10:01:00Z', to: '2031-03-14T10:10:00Z', lat: 10.25, lon: -30.4986 },
      { from: '2031-03-14T10:10:00Z', to: '2031-03-14T10:20:00Z', lat: 10.25, lon: -30.4986 },
    ])
  })

  it('reports a role without any remaining interval and blocks validation', async () => {
    await upload()
    await press(button('Delete', row('Finish Pin')))
    expect(container.textContent).toContain('Finish Pin has role finish_pin but no remaining stable interval')
    expect(button('Validate course').disabled).toBe(true)
  })

  it('reads gun and end inputs as UTC regardless of the local time zone', async () => {
    process.env.TZ = 'Pacific/Auckland'
    await upload()
    await type(labelled(container, 'Gun'), '2031-03-14 10:05:00')
    await type(labelled(container, 'Race end'), '2031-03-14T10:45')
    expect(query('[data-preview]')?.getAttribute('data-gun')).toBe('2031-03-14T10:05:00Z')
    const course = await validated()
    expect(course.race).toEqual({ label: 'Synthetic Race 7', gun_utc: '2031-03-14T10:05:00Z', gun_source: 'admin_entered', end_utc: '2031-03-14T10:45:00Z' })
    await type(labelled(container, 'Gun'), '14/03/2031 10:05')
    expect(container.textContent).toContain('Enter the gun as YYYY-MM-DD HH:MM:SS UTC.')
    expect(button('Validate course').disabled).toBe(true)
  })

  it('shows 422 schema errors readably', async () => {
    await upload()
    vi.mocked(api.validateCourse).mockRejectedValueOnce(new api.AdminApiError(422, undefined, [
      { loc: ['body', 'race'], msg: 'Value error, race gun_utc must lie within time_range', type: 'value_error' },
    ]))
    await press(button('Validate course'))
    expect(container.textContent).toContain('The course is not valid:')
    expect(container.textContent).toContain('race: race gun_utc must lie within time_range')
    expect(container.textContent).not.toContain('Download course JSON')
  })

  it('downloads the validated course JSON named after the race label', async () => {
    const createObjectURL = vi.fn(() => 'blob:course')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download) })
    await upload()
    await type(labelled(container, 'Race label'), 'Race 1 - Group D')
    await validated()
    expect(container.textContent).toContain('Valid course context · schema v1')
    await press(button('Download course JSON'))
    expect(clicks).toEqual(['race-1-group-d.course.json'])
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0]
    expect(JSON.parse(await blob.text())).toMatchObject({ course_id: 'c-1', race: { label: 'Race 1 - Group D' } })
    // Any further edit invalidates the validated result.
    await type(labelled(container, 'Race label'), 'Race 2')
    expect(container.textContent).not.toContain('Download course JSON')
  })
})
