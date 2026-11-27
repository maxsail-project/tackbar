import { courseElementColor } from '../config/courseColors'
import type { CourseElement, CourseElementRole, CourseLine } from '../types/course'

// Course context schema v1: which elements and lines are valid at time t
// (Issue #242). Pure and provider-independent, reusable by the Viewer.
//
// A position interval is closed: it contains t when from <= t <= to. Schema v1
// allows consecutive intervals of one element to touch (to === next.from) but
// not overlap; at a touching instant the later interval applies.

export interface CourseShape {
  elements: CourseElement[]
  start_line: CourseLine | null
  finish_line: CourseLine | null
}

export interface CourseElementAt {
  id: string
  role: CourseElementRole
  gate: string | null
  label: string
  lat: number
  lon: number
  color: string
}

export interface CourseLineAt {
  boat: CourseElementAt
  pin: CourseElementAt
}

export interface CourseStateAt {
  elements: CourseElementAt[]
  startLine: CourseLineAt | null
  finishLine: CourseLineAt | null
}

export function positionAt(element: CourseElement, timeMs: number) {
  let match: CourseElement['positions'][number] | null = null
  for (const position of element.positions) {
    if (Date.parse(position.from) <= timeMs && timeMs <= Date.parse(position.to)) match = position
  }
  return match
}

export function courseStateAt(course: CourseShape, timeMs: number): CourseStateAt {
  const elements: CourseElementAt[] = []
  for (const element of course.elements) {
    const position = positionAt(element, timeMs)
    if (!position) continue
    elements.push({
      id: element.id, role: element.role, gate: element.gate, label: element.label,
      lat: position.lat, lon: position.lon, color: courseElementColor(element.role),
    })
  }
  const byId = new Map(elements.map((element) => [element.id, element]))
  const line = (reference: CourseLine | null): CourseLineAt | null => {
    if (!reference) return null
    const boat = byId.get(reference.boat)
    const pin = byId.get(reference.pin)
    return boat && pin ? { boat, pin } : null
  }
  return { elements, startLine: line(course.start_line), finishLine: line(course.finish_line) }
}

/** A Session course as the Viewer receives it (schema v1 subset). */
export interface ViewerCourse extends CourseShape {
  course_id: string
  time_range: { from: string, to: string }
}

/**
 * True when `timeMs` lies in the time range (bounds included) of a course that
 * has a start line (#242 B): the inferred VKX start line is not drawn there.
 */
export function isWithinCourseStartLineRange(courses: readonly ViewerCourse[], timeMs: number) {
  return courses.some((course) => course.start_line !== null
    && Date.parse(course.time_range.from) <= timeMs && timeMs <= Date.parse(course.time_range.to))
}
