import type { CourseElementRole } from '../types/course'

// Issue #242 D8. Course marks and the start and finish lines reuse the Viewer
// start-line color (TrackMap.tsx session start line).
export const COURSE_MARK_COLOR = '#B46B42'
export const COURSE_LINE_COLOR = COURSE_MARK_COLOR

// The change mark is red. #D62828 (hue ≈ 0°) is distinct in hue from the
// course copper #B46B42 (≈ 22°), Primary #168097 (teal) and Comparison
// #9a5aaf (purple), and keeps about 4.7:1 contrast against the light Positron
// map style, legible with the white outline used for course mark labels.
export const COURSE_CHANGE_MARK_COLOR = '#D62828'

export function courseElementColor(role: CourseElementRole): string {
  return role === 'change_mark' ? COURSE_CHANGE_MARK_COLOR : COURSE_MARK_COLOR
}
