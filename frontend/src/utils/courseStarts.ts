import type { PublicCourseContext } from '../types/course'
import { positionAt } from './courseState'
import { inferSessionStartLines, type SessionStartLine } from './sessionStartLines'
import type { InferredSessionStart, SessionTimerActivity } from './sessionStarts'

// Course Start as a Session Start source (Issue #242, increment 242.4; D2, D3,
// D10). Ephemeral Viewer context: nothing here is persisted.

export type SessionStartSource = 'course' | 'vkx'

/** A merged Session Start: `time` is the course gun or the inferred VKX timer zero. */
export interface SessionStart extends InferredSessionStart {
  source: SessionStartSource
  /** Course `end_utc` in milliseconds (D10); null for VKX Starts and courses without an end. */
  courseEndTime: number | null
}

export interface SourcedSessionStartLine extends SessionStartLine {
  source: SessionStartSource
}

export type StartCourse = Pick<PublicCourseContext, 'race' | 'time_range' | 'start_line' | 'elements'>

interface CourseStart {
  time: number
  endTime: number | null
  rangeFrom: number
  rangeTo: number
  pin: SessionStartLine['pin']
  boat: SessionStartLine['boat']
}

function endpointAt(course: StartCourse, elementId: string | undefined, time: number): SessionStartLine['pin'] {
  const element = course.elements.find((candidate) => candidate.id === elementId)
  const position = element ? positionAt(element, time) : null
  return position ? { latitude: position.lat, longitude: position.lon } : null
}

/**
 * One Start per course with a gun (D2). The line is the course start line at the
 * gun: PIN = its start pin, BOAT = its committee boat; an endpoint without a
 * position interval containing the gun is null.
 */
export function courseStarts(courses: readonly StartCourse[]): CourseStart[] {
  return courses.flatMap((course) => {
    const time = course.race.gun_utc === null ? Number.NaN : Date.parse(course.race.gun_utc)
    if (!Number.isFinite(time)) return []
    const endTime = course.race.end_utc === null ? Number.NaN : Date.parse(course.race.end_utc)
    return [{
      time,
      endTime: Number.isFinite(endTime) ? endTime : null,
      rangeFrom: Date.parse(course.time_range.from),
      rangeTo: Date.parse(course.time_range.to),
      pin: endpointAt(course, course.start_line?.pin, time),
      boat: endpointAt(course, course.start_line?.boat, time),
    }]
  })
}

/**
 * D3: within the time range (bounds included) of a course that yields a Start,
 * the course Start replaces the inferred VKX Starts and lines. The remaining
 * Starts are merged chronologically and labelled `S1`, `S2`… over the merged
 * list. Without a course gun the inferred Starts and lines are unchanged.
 */
export function mergeSessionStarts(
  inferred: InferredSessionStart[],
  activities: SessionTimerActivity[],
  courses: readonly StartCourse[],
): { starts: SessionStart[], lines: SourcedSessionStartLine[] } {
  const fromCourses = courseStarts(courses)
  const kept = inferred.filter((start) => !fromCourses.some(
    (course) => start.time >= course.rangeFrom && start.time <= course.rangeTo,
  ))
  const vkxLines = inferSessionStartLines(kept, activities)
  const merged = [
    ...kept.map((start, index) => ({
      time: start.time, activityIds: start.activityIds, source: 'vkx' as const, courseEndTime: null,
      pin: vkxLines[index].pin, boat: vkxLines[index].boat,
    })),
    ...fromCourses.map((course) => ({
      time: course.time, activityIds: [] as string[], source: 'course' as const, courseEndTime: course.endTime,
      pin: course.pin, boat: course.boat,
    })),
  ].sort((a, b) => a.time - b.time)
  return {
    starts: merged.map(({ time, activityIds, source, courseEndTime }, index) => ({
      label: `S${index + 1}`, time, activityIds, source, courseEndTime,
    })),
    lines: merged.map(({ time, pin, boat, source }, index) => ({
      label: `S${index + 1}`, time, pin, boat, source,
    })),
  }
}
