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
  attachSessionCourse: vi.fn(),
  listSessionCourses: vi.fn(),
  suggestSessionCourseGun: vi.fn(),
  findCourseSessionCandidates: vi.fn(),
}))
vi.mock('./CourseMapPreview', () => ({
  default: ({ course, gunUtc }: { course: { elements: unknown[], start_line: unknown }, gunUtc: string | null }) =>
    <div data-preview data-elements={course.elements.length} data-start-line={course.start_line ? 'yes' : 'no'} data-gun={gunUtc ?? ''} />,
}))

let container: HTMLDivElement
let root: Root
const onUnauthorized = vi.fn()
const confirm = vi.fn(() => true)
const sessions = [
  { id: 'session-old', created_at: '2031-01-01T00:00:00Z', expires_at: '2031-12-01T00:00:00Z', total_activity_count: 1, visible_activity_count: 1,
    sailor_count: 1, capability_state: 'active', sailing_start: '2031-01-01T10:00:00Z', sailing_end: '2031-01-01T11:00:00Z',
    location_label: 'Elsewhere', location_country: null },
  { id: 'session-race', created_at: '2031-03-14T00:00:00Z', expires_at: '2031-12-01T00:00:00Z', total_activity_count: 4, visible_activity_count: 4,
    sailor_count: 4, capability_state: 'active', sailing_start: '2031-03-14T09:50:00Z', sailing_end: '2031-03-14T11:10:00Z',
    location_label: 'Rio de Janeiro', location_country: 'Brazil' },
] as never[]
const originalTz = process.env.TZ

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.mocked(api.createGeoRacingCourseDraft).mockResolvedValue(courseDraftFixture())
  vi.mocked(api.listSessionCourses).mockResolvedValue({ courses: [] })
  vi.mocked(api.findCourseSessionCandidates).mockResolvedValue({ candidates: [] })
  confirm.mockReturnValue(true)
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
  await act(async () => root.render(<AdminCourseImport adminKey="key" sessions={sessions} onUnauthorized={onUnauthorized} confirm={confirm} />))
}
async function upload(name = 'Synthetic Race 7_elements.gpx') {
  await renderTool()
  const input = query<HTMLInputElement>('input[type="file"]')!
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [new File(['<gpx>elements</gpx>'], name)], configurable: true })
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
    expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Download course JSON')).toBe(false)
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
    expect([...container.querySelectorAll('button')].some((item) => item.textContent === 'Download course JSON')).toBe(false)
  })

  it('lists Sessions overlapping the course first and attaches the reviewed course with its original bytes', async () => {
    vi.mocked(api.attachSessionCourse).mockImplementation(async (_key, _session, _name, course) => ({ course: { ...course, course_id: 'c-1' }, replaced_course_ids: [] }))
    await upload()
    const picker = labelled(container, 'Session') as unknown as HTMLSelectElement
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      'Select a Session',
      'Rio de Janeiro, Brazil · 2031-03-14 09:50–11:10 UTC · 4 Activities',
      'Elsewhere · 2031-01-01 10:00–11:00 UTC · 1 Activities',
    ])
    expect(button('Attach to Session').disabled).toBe(true)
    await choose(picker, 'session-race')
    expect(api.listSessionCourses).toHaveBeenCalledWith('key', 'session-race')
    await press(button('Attach to Session'))
    await vi.waitFor(() => expect(api.attachSessionCourse).toHaveBeenCalled())
    const [key, sessionId, filename, course, original] = vi.mocked(api.attachSessionCourse).mock.calls[0]
    expect([key, sessionId, filename]).toEqual(['key', 'session-race', 'Synthetic Race 7_elements.gpx'])
    expect(atob(original)).toBe('<gpx>elements</gpx>')
    expect(course.source.sha256).toBe('0'.repeat(64))
    expect(confirm).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(container.textContent).toContain('Attached \u201cSynthetic Race 7\u201d to Rio de Janeiro, Brazil'))
    // Download stays available as a secondary option (D9).
    expect(button('Validate course').className).not.toContain('admin-primary')
    expect(button('Attach to Session').className).toContain('admin-primary')
  })

  it('asks before replacing an overlapping course and attaches nothing when declined', async () => {
    vi.mocked(api.listSessionCourses).mockResolvedValue({ courses: [{
      course_id: 'old', available: true, race_label: 'Race 7 (first import)', time_range: { from: '2031-03-14T10:10:00Z', to: '2031-03-14T10:50:00Z' },
      gun_utc: null, source_filename: 'old.gpx', imported_at: '2031-03-14T12:00:00Z', element_count: 4,
    }] })
    confirm.mockReturnValue(false)
    await upload()
    await choose(labelled(container, 'Session') as unknown as HTMLSelectElement, 'session-race')
    expect(container.textContent).toContain('Already attached: Race 7 (first import)')
    await press(button('Attach to Session'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Replace Race 7 (first import) in this Session?'))
    expect(api.attachSessionCourse).not.toHaveBeenCalled()
  })

  it('shows attach errors readably', async () => {
    vi.mocked(api.attachSessionCourse).mockRejectedValueOnce(new api.AdminApiError(422, undefined, 'The uploaded original is not the file this course was reviewed from'))
    await upload()
    await choose(labelled(container, 'Session') as unknown as HTMLSelectElement, 'session-race')
    await press(button('Attach to Session'))
    await vi.waitFor(() => expect(container.textContent).toContain('The course could not be attached:'))
    expect(container.textContent).toContain('The uploaded original is not the file this course was reviewed from')
  })

  it('shows a gun suggestion that the Admin may apply, and an explicit no-crossing result', async () => {
    vi.mocked(api.suggestSessionCourseGun).mockResolvedValueOnce({ suggestion: {
      gun_utc: '2031-03-14T10:05:20Z', crossing_utc: '2031-03-14T10:05:19.600Z', activity_id: 'a-1', basis: 'earliest_start_line_crossing',
    } })
    await upload()
    expect(button('Suggest gun').disabled).toBe(true)
    await choose(labelled(container, 'Session') as unknown as HTMLSelectElement, 'session-race')
    await press(button('Suggest gun'))
    expect(api.suggestSessionCourseGun).toHaveBeenCalledWith('key', 'session-race', expect.objectContaining({ race: expect.objectContaining({ gun_utc: null }) }))
    expect(container.textContent).toContain('Suggested gun: 2031-03-14 10:05:20 UTC')
    expect(labelled(container, 'Gun').value).toBe('')
    await press(button('Use as gun'))
    expect(labelled(container, 'Gun').value).toBe('2031-03-14 10:05:20')
    vi.mocked(api.suggestSessionCourseGun).mockResolvedValueOnce({ suggestion: null })
    await press(button('Suggest gun'))
    expect(container.textContent).toContain('No start-line crossing was found in the course time range.')
  })

  describe('candidate Session preselection', () => {
    const picker = () => labelled(container, 'Session') as unknown as HTMLSelectElement

    it('preselects exactly one candidate, labels it, and still needs the explicit Attach click', async () => {
      vi.mocked(api.findCourseSessionCandidates).mockResolvedValue({ candidates: [{ session_id: 'session-old', overlap_seconds: 1800, min_distance_m: 420 }] })
      await upload()
      await vi.waitFor(() => expect(picker().value).toBe('session-old'))
      expect(api.findCourseSessionCandidates).toHaveBeenCalledWith('key', expect.objectContaining({ time_range: courseDraftFixture().time_range }))
      expect(picker().options[1].textContent).toBe('Elsewhere · 2031-01-01 10:00–11:00 UTC · 1 Activities · candidate · 30 min overlap · 420 m from start line')
      expect(api.listSessionCourses).toHaveBeenCalledWith('key', 'session-old')
      expect(container.textContent).toContain('One candidate Session sailed near the start line during the course and is preselected.')
      expect(api.attachSessionCourse).not.toHaveBeenCalled()
      expect(button('Attach to Session').disabled).toBe(false)
    })

    it('lists several candidates first with overlap and distance and preselects none', async () => {
      vi.mocked(api.findCourseSessionCandidates).mockResolvedValue({ candidates: [
        { session_id: 'session-old', overlap_seconds: 600, min_distance_m: 150 },
        { session_id: 'session-race', overlap_seconds: 3600, min_distance_m: 1500 },
      ] })
      await upload()
      await vi.waitFor(() => expect(container.textContent).toContain('2 candidate Sessions are listed first. Choose one.'))
      expect(picker().value).toBe('')
      expect([...picker().options].slice(1).map((option) => option.value)).toEqual(['session-old', 'session-race'])
      expect(picker().options[2].textContent).toContain('candidate · 60 min overlap · 1.5 km from start line')
      expect(api.attachSessionCourse).not.toHaveBeenCalled()
    })

    it('reports no candidate and keeps the explicit choice', async () => {
      await upload()
      await vi.waitFor(() => expect(container.textContent).toContain('No candidate Session sailed near the start line during the course.'))
      expect(picker().value).toBe('')
      expect([...picker().options].some((option) => option.textContent?.includes('candidate ·'))).toBe(false)
    })
  })
})
