import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AdminApiError, detachSessionCourse, listSessionCourses, suggestAttachedCourseGun, updateSessionCourseRaceTimes,
} from '../api/adminApi'
import type { AttachedCourseSummary, CourseGunSuggestion } from '../types/course'
import { formatUtcInput, formatUtcTime, parseUtcInput, validationMessages } from '../utils/courseImport'
import CourseGunSuggestionNotice from './CourseGunSuggestionNotice'

// Courses attached to one Session, shown in Admin Session detail (Issue #242, 242.3).
// Only their gun and end can be edited in place (D14, 242.3.2).

export function courseRangeLabel(course: AttachedCourseSummary) {
  if (!course.time_range) return 'Time range unavailable'
  return `${formatUtcInput(course.time_range.from)}–${formatUtcTime(course.time_range.to)} UTC`
}

function failureMessages(cause: unknown, fallback: string): string[] {
  if (cause instanceof AdminApiError) {
    if (cause.status === 422) return validationMessages(cause.detail)
    if (cause.status === 404) return ['The course is no longer attached to this Session. Refresh and try again.']
    if (cause.status === 409) return ['The course file is unavailable.']
  }
  return [fallback]
}

export default function AdminSessionCourses({ adminKey, sessionId, onUnauthorized, confirm = (message) => window.confirm(message) }: {
  adminKey: string
  sessionId: string
  onUnauthorized: (error: AdminApiError) => void
  confirm?: (message: string) => boolean
}) {
  const [courses, setCourses] = useState<AttachedCourseSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  // The parent's handler may change identity on every render; read it via a ref.
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => { unauthorized.current = onUnauthorized })

  useEffect(() => {
    let current = true
    setCourses(null); setError(null); setEditing(null)
    listSessionCourses(adminKey, sessionId).then((result) => {
      if (current) setCourses(result.courses)
    }).catch((cause: unknown) => {
      if (!current) return
      setError('Attached courses could not be loaded.')
      if (cause instanceof AdminApiError && cause.status === 401) unauthorized.current(cause)
    })
    return () => { current = false }
  }, [adminKey, sessionId])

  const detach = async (course: AttachedCourseSummary) => {
    if (busy || !confirm(`Detach ${course.race_label ?? 'this course'} from the Session? Its course context and preserved original are deleted.`)) return
    setBusy(true); setError(null)
    try {
      setCourses((await detachSessionCourse(adminKey, sessionId, course.course_id)).courses)
    } catch (cause) {
      setError('The course could not be detached. Refresh and try again.')
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setBusy(false) }
  }

  return <section className="admin-session-section admin-session-courses" aria-label="Courses"><h3>Courses</h3>
    {courses === null && !error && <p className="admin-meta">Loading attached courses…</p>}
    {courses?.length === 0 && <p className="admin-meta">No course attached. Attach one from Courses.</p>}
    {courses && courses.length > 0 && <ul className="admin-session-course-list">
      {courses.map((course) => <li key={course.course_id} className="admin-session-course">
        <div>
          <strong>{course.available ? course.race_label : 'Course file unavailable'}</strong>
          <p className="admin-meta">{courseRangeLabel(course)}{course.gun_utc ? ` · Gun ${formatUtcTime(course.gun_utc)} UTC` : ''}{course.end_utc ? ` · End ${formatUtcTime(course.end_utc)} UTC` : ''}</p>
          {course.source_filename && <p className="admin-meta">Source: {course.source_filename}</p>}
        </div>
        {editing === course.course_id
          ? <RaceTimesEditor adminKey={adminKey} sessionId={sessionId} course={course}
              onSaved={(next) => { setCourses(next); setEditing(null) }}
              onCancel={() => setEditing(null)} onUnauthorized={onUnauthorized} />
          : <div className="admin-actions">
              {course.available && <button type="button" disabled={busy} onClick={() => setEditing(course.course_id)}>Edit times</button>}
              <button type="button" className="danger" disabled={busy} onClick={() => void detach(course)}>Detach</button>
            </div>}
      </li>)}
    </ul>}
    {error && <p className="admin-error" role="alert">{error}</p>}
  </section>
}

/** Inline gun and end editor, in UTC whatever the browser time zone. */
function RaceTimesEditor({ adminKey, sessionId, course, onSaved, onCancel, onUnauthorized }: {
  adminKey: string
  sessionId: string
  course: AttachedCourseSummary
  onSaved: (courses: AttachedCourseSummary[]) => void
  onCancel: () => void
  onUnauthorized: (error: AdminApiError) => void
}) {
  const [gun, setGun] = useState(course.gun_utc ? formatUtcInput(course.gun_utc) : '')
  const [end, setEnd] = useState(course.end_utc ? formatUtcInput(course.end_utc) : '')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<CourseGunSuggestion | null | undefined>(undefined)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)

  const unauthorized = (cause: unknown) => {
    if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    // An empty field clears that time.
    const gunUtc = gun.trim() ? parseUtcInput(gun) : null
    const endUtc = end.trim() ? parseUtcInput(end) : null
    const problems = [
      ...(gun.trim() && !gunUtc ? ['Enter the gun as YYYY-MM-DD HH:MM:SS UTC.'] : []),
      ...(end.trim() && !endUtc ? ['Enter the race end as YYYY-MM-DD HH:MM:SS UTC.'] : []),
    ]
    setErrors(problems)
    if (problems.length > 0) return
    setSaving(true)
    try {
      onSaved((await updateSessionCourseRaceTimes(adminKey, sessionId, course.course_id, { gun_utc: gunUtc, end_utc: endUtc })).courses)
    } catch (cause) {
      setErrors(failureMessages(cause, 'The race times could not be saved. Try again.'))
      setSaving(false)
      unauthorized(cause)
    }
  }

  const suggest = async () => {
    if (suggesting) return
    setSuggesting(true); setSuggestion(undefined); setSuggestionError(null)
    try {
      setSuggestion((await suggestAttachedCourseGun(adminKey, sessionId, course.course_id)).suggestion)
    } catch (cause) {
      setSuggestionError(failureMessages(cause, 'The gun suggestion failed. Try again.').join(' '))
      unauthorized(cause)
    } finally { setSuggesting(false) }
  }

  return <form aria-label={`Edit times of ${course.race_label}`} onSubmit={(event) => void save(event)}>
    <p className="admin-meta">Times are UTC, within {courseRangeLabel(course)}. Clear a field to remove that time.</p>
    <div className="admin-upload__fields">
      <label>Gun (UTC, optional)<input value={gun} placeholder="YYYY-MM-DD HH:MM:SS" inputMode="numeric" disabled={saving} onChange={(event) => setGun(event.target.value)} /></label>
      <label>Race end (UTC, optional)<input value={end} placeholder="YYYY-MM-DD HH:MM:SS" inputMode="numeric" disabled={saving} onChange={(event) => setEnd(event.target.value)} /></label>
    </div>
    <div className="admin-actions">
      <button type="button" className="admin-section-action" disabled={suggesting || saving} onClick={() => void suggest()}>{suggesting ? 'Searching crossings…' : 'Suggest gun'}</button>
    </div>
    {suggestion && <CourseGunSuggestionNotice suggestion={suggestion} onUse={setGun} />}
    {suggestion === null && <p className="admin-meta" role="status">No start-line crossing was found in the course time range.</p>}
    {suggestionError && <p className="admin-error" role="alert">{suggestionError}</p>}
    {errors.length > 0 && <div className="admin-error" role="alert"><p>The times were not saved:</p><ul>{errors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
    <div className="admin-actions">
      <button type="submit" className="admin-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    </div>
  </form>
}
