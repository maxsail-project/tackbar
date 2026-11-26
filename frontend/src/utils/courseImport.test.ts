import { afterEach, describe, expect, it } from 'vitest'
import { courseDraftFixture } from '../components/courseDraftFixture'
import {
  buildReviewedCourse, courseFilename, editableTracks, editInterval, formatUtcInput, parseUtcInput,
  reviewIssues, validationMessages,
} from './courseImport'

const originalTz = process.env.TZ
afterEach(() => { process.env.TZ = originalTz })

describe('explicit UTC entry', () => {
  it.each(['America/Sao_Paulo', 'Asia/Tokyo', 'Europe/Madrid', 'UTC'])('parses and formats independently of local time zone %s', (zone) => {
    process.env.TZ = zone
    expect(parseUtcInput('2031-03-14 10:05:00')).toBe('2031-03-14T10:05:00Z')
    expect(parseUtcInput('2031-03-14T10:05Z')).toBe('2031-03-14T10:05:00Z')
    expect(formatUtcInput('2031-03-14T10:05:07Z')).toBe('2031-03-14 10:05:07')
  })

  it.each(['', '10:05', '2031-02-30 10:00:00', '2031-03-14 24:00:00', '2031-03-14 10:05:00+02:00', 'tomorrow'])('rejects %j', (value) => {
    expect(parseUtcInput(value)).toBeNull()
  })
})

describe('interval editing', () => {
  const pin = () => editableTracks(courseDraftFixture()).find((item) => item.track.label === 'Start Pin')!

  it('trims only within the original stable segment bounds', () => {
    const intervals = pin().intervals
    const [first] = intervals
    const trimmed = editInterval(intervals, first.key, { kind: 'trim', from: '2031-03-14 10:02:00', to: '2031-03-14 10:18:00' })
    expect('intervals' in trimmed && trimmed.intervals[0]).toMatchObject({ from: '2031-03-14T10:02:00Z', to: '2031-03-14T10:18:00Z' })
    expect(editInterval(intervals, first.key, { kind: 'trim', from: '2031-03-14 09:59:00', to: '2031-03-14 10:10:00' }))
      .toMatchObject({ error: expect.stringContaining('within 10:00:00–10:20:00 UTC') })
    expect(editInterval(intervals, first.key, { kind: 'trim', from: '2031-03-14 10:10:00', to: '2031-03-14 10:10:00' }))
      .toMatchObject({ error: 'The end must be after the start.' })
  })

  it('splits into touching halves that keep the median position and narrower bounds', () => {
    const intervals = pin().intervals
    const result = editInterval(intervals, intervals[0].key, { kind: 'split', at: '2031-03-14 10:08:00' })
    if (!('intervals' in result)) throw new Error(result.error)
    const [a, b, rest] = result.intervals
    expect([a.from, a.to, b.from, b.to]).toEqual(['2031-03-14T10:00:00Z', '2031-03-14T10:08:00Z', '2031-03-14T10:08:00Z', '2031-03-14T10:20:00Z'])
    expect([a.lat, a.lon]).toEqual([b.lat, b.lon])
    expect([a.boundsTo, b.boundsFrom]).toEqual(['2031-03-14T10:08:00Z', '2031-03-14T10:08:00Z'])
    expect(rest).toBe(intervals[1])
    expect(editInterval(intervals, intervals[0].key, { kind: 'split', at: '2031-03-14 10:20:00' })).toHaveProperty('error')
  })

  it('deletes an interval, and a role without intervals is reported before validation', () => {
    const tracks = editableTracks(courseDraftFixture())
    const finish = tracks.find((item) => item.track.label === 'Finish Pin')!
    const result = editInterval(finish.intervals, finish.intervals[0].key, { kind: 'delete' })
    if (!('intervals' in result)) throw new Error(result.error)
    finish.intervals = result.intervals
    expect(reviewIssues(tracks, { label: 'R', gun: '', end: '' })).toEqual([
      'Finish Pin has role finish_pin but no remaining stable interval. Ignore it or keep an interval.',
    ])
  })
})

describe('reviewed course', () => {
  it('rebuilds the 242.1 suggested course from the unedited draft', () => {
    const draft = courseDraftFixture()
    const reviewed = buildReviewedCourse(draft, editableTracks(draft), { label: 'Synthetic Race 7', gun: '', end: '' })
    expect(reviewed).toEqual(draft.suggested_course)
  })

  it('never turns relocation stretches or ignored tracks into positions', () => {
    const draft = courseDraftFixture()
    const reviewed = buildReviewedCourse(draft, editableTracks(draft), { label: 'R', gun: '2031-03-14 10:05:00', end: '' })
    const pin = reviewed.elements.find((element) => element.id === 'start_pin')!
    expect(pin.positions.map((position) => position.from)).toEqual(['2031-03-14T10:00:00Z', '2031-03-14T10:22:00Z'])
    expect(reviewed.elements.map((element) => element.id)).not.toContain('spare_1')
    expect(reviewed.race).toEqual({ label: 'R', gun_utc: '2031-03-14T10:05:00Z', gun_source: 'admin_entered', end_utc: null })
  })

  it('derives the download filename and readable validation messages', () => {
    expect(courseFilename('Race 1 - Group D')).toBe('race-1-group-d.course.json')
    expect(courseFilename('  ')).toBe('course.course.json')
    expect(validationMessages([{ loc: ['body', 'start_line'], msg: "Value error, start_line.pin must reference a 'start_pin' element" }]))
      .toEqual(["start_line: start_line.pin must reference a 'start_pin' element"])
    expect(validationMessages('Request body must be valid JSON')).toEqual(['Request body must be valid JSON'])
  })
})
