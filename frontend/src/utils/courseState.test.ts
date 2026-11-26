import { describe, expect, it } from 'vitest'
import { COURSE_CHANGE_MARK_COLOR, COURSE_MARK_COLOR, courseElementColor } from '../config/courseColors'
import type { CourseElement } from '../types/course'
import { courseStateAt, positionAt, type CourseShape } from './courseState'

const t = (hhmmss: string) => Date.parse(`2031-03-14T${hhmmss}Z`)
const element = (id: string, role: CourseElement['role'], positions: [string, string, number, number][]): CourseElement => ({
  id, role, gate: role === 'gate' ? 'G' : null, label: id.toUpperCase(),
  positions: positions.map(([from, to, lat, lon]) => ({ from: `2031-03-14T${from}Z`, to: `2031-03-14T${to}Z`, lat, lon })),
})

const course: CourseShape = {
  elements: [
    element('rc', 'committee_boat', [['10:00:00', '10:50:00', 10, -30]]),
    // Relocated: touching intervals at 10:20:00.
    element('pin', 'start_pin', [['10:00:00', '10:20:00', 10, -29.99], ['10:20:00', '10:40:00', 10.001, -29.99]]),
    element('finish', 'finish_pin', [['10:13:00', '10:53:00', 10, -29.98]]),
    element('change', 'change_mark', [['10:25:00', '10:28:00', 10.02, -30]]),
  ],
  start_line: { boat: 'rc', pin: 'pin' },
  finish_line: { boat: 'rc', pin: 'finish' },
}

describe('course state at time t', () => {
  it('contains a position exactly at both closed bounds and not outside them', () => {
    const rc = course.elements[0]
    expect(positionAt(rc, t('10:00:00'))).not.toBeNull()
    expect(positionAt(rc, t('10:50:00'))).not.toBeNull()
    expect(positionAt(rc, t('09:59:59'))).toBeNull()
    expect(positionAt(rc, t('10:50:01'))).toBeNull()
  })

  it('uses the later of two touching intervals at the shared instant', () => {
    const pin = course.elements[1]
    expect(positionAt(pin, t('10:19:59'))?.lat).toBe(10)
    expect(positionAt(pin, t('10:20:00'))?.lat).toBe(10.001)
    expect(positionAt(pin, t('10:20:01'))?.lat).toBe(10.001)
  })

  it('draws a line only while both referenced elements have a valid position', () => {
    expect(courseStateAt(course, t('10:05:00')).startLine).not.toBeNull()
    expect(courseStateAt(course, t('10:05:00')).finishLine).toBeNull() // finish pin not laid yet
    expect(courseStateAt(course, t('10:13:00')).finishLine).not.toBeNull()
    const late = courseStateAt(course, t('10:45:00'))
    expect(late.startLine).toBeNull() // pin recovered
    expect(late.finishLine).not.toBeNull()
    const end = courseStateAt(course, t('10:51:00'))
    expect(end.finishLine).toBeNull() // committee boat gone
    expect(end.elements.map((item) => item.id)).toEqual(['finish'])
  })

  it('ignores a line that references an unknown element and draws no lines without references', () => {
    expect(courseStateAt({ ...course, start_line: { boat: 'rc', pin: 'nowhere' } }, t('10:05:00')).startLine).toBeNull()
    expect(courseStateAt({ ...course, start_line: null, finish_line: null }, t('10:30:00')))
      .toMatchObject({ startLine: null, finishLine: null })
  })

  it('maps the change mark to red and every other element to the course color', () => {
    const state = courseStateAt(course, t('10:26:00'))
    expect(state.elements.find((item) => item.id === 'change')?.color).toBe(COURSE_CHANGE_MARK_COLOR)
    expect(state.elements.find((item) => item.id === 'rc')?.color).toBe(COURSE_MARK_COLOR)
    expect(COURSE_MARK_COLOR).toBe('#B46B42')
    for (const role of ['committee_boat', 'start_pin', 'finish_pin', 'gate', 'mark'] as const) {
      expect(courseElementColor(role)).toBe(COURSE_MARK_COLOR)
    }
    expect(courseElementColor('change_mark')).not.toBe(COURSE_MARK_COLOR)
    expect([COURSE_MARK_COLOR, '#168097', '#9a5aaf']).not.toContain(COURSE_CHANGE_MARK_COLOR)
  })
})
