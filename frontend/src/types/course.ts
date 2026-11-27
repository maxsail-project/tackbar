// Course context schema v1 and Admin course-import draft shapes (Issue #242).
// Mirrors backend/app/course/schema.py and backend/app/course/draft.py.

export const COURSE_ROLES = [
  'committee_boat', 'start_pin', 'finish_pin', 'gate', 'mark', 'change_mark', 'ignored',
] as const
export type CourseRole = typeof COURSE_ROLES[number]
export type CourseElementRole = Exclude<CourseRole, 'ignored'>

export interface CoursePosition { from: string; to: string; lat: number; lon: number }

export interface CourseElement {
  id: string
  role: CourseElementRole
  gate: string | null
  label: string
  positions: CoursePosition[]
}

export interface CourseLine { boat: string; pin: string }

export interface CourseSource { kind: 'georacing_elements_gpx'; filename: string; sha256: string; imported_at: string }

export interface CourseRace {
  label: string
  gun_utc: string | null
  gun_source: 'admin_entered' | null
  end_utc: string | null
}

export interface CourseTimeRange { from: string; to: string }

export interface ReviewedCourse {
  schema_version: 1
  course_id: string | null
  source: CourseSource
  race: CourseRace
  time_range: CourseTimeRange
  start_line: CourseLine | null
  finish_line: CourseLine | null
  elements: CourseElement[]
  ignored_tracks: { label: string; reason: string }[]
}

export interface CourseContextV1 extends ReviewedCourse { course_id: string }

export interface CourseDraftSegment {
  kind: 'stable' | 'relocation'
  from: string
  to: string
  sample_count: number
  lat: number | null
  lon: number | null
  dispersion_m: number | null
}

export interface CourseDraftTrack {
  track_id: string
  label: string
  element_id: string
  sample_count: number
  first_utc: string
  last_utc: string
  suggested_role: CourseRole
  suggested_gate: string | null
  role_basis: string
  stationary: boolean
  duplicate_of: string | null
  segments: CourseDraftSegment[]
}

export interface CourseImportDraft {
  provider: 'georacing_elements_gpx'
  source: CourseSource
  file_name: string | null
  time_range: CourseTimeRange
  parameters: { max_dispersion_m: number; min_duration_s: number; max_sample_gap_s: number }
  tracks: CourseDraftTrack[]
  suggested_course: ReviewedCourse
}

/** Shared-read course context (#242 D7): no content hash or stored paths. */
export interface PublicCourseContext extends Omit<CourseContextV1, 'source'> {
  source: Omit<CourseSource, 'sha256'>
}

export interface SessionCourses { courses: PublicCourseContext[] }

/** Admin summary of a course attached to a Session. */
export interface AttachedCourseSummary {
  course_id: string
  available: boolean
  race_label: string | null
  time_range: CourseTimeRange | null
  gun_utc: string | null
  end_utc: string | null
  source_filename: string | null
  imported_at: string | null
  element_count: number | null
}

export interface CourseGunSuggestion {
  gun_utc: string
  crossing_utc: string
  activity_id: string
  basis: 'earliest_start_line_crossing'
}

/** Admin preselection help (#242): a Session that plausibly sailed the course. */
export interface CourseSessionCandidate {
  session_id: string
  overlap_seconds: number
  min_distance_m: number
}
