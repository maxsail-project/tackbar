import { useEffect, useRef, useState } from 'react'
import { AdminApiError, detachSessionCourse, listSessionCourses } from '../api/adminApi'
import type { AttachedCourseSummary } from '../types/course'
import { formatUtcInput, formatUtcTime } from '../utils/courseImport'

// Courses attached to one Session, shown in Admin Session detail (Issue #242, 242.3).

export function courseRangeLabel(course: AttachedCourseSummary) {
  if (!course.time_range) return 'Time range unavailable'
  return `${formatUtcInput(course.time_range.from)}–${formatUtcTime(course.time_range.to)} UTC`
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
  // The parent's handler may change identity on every render; read it via a ref.
  const unauthorized = useRef(onUnauthorized)
  useEffect(() => { unauthorized.current = onUnauthorized })

  useEffect(() => {
    let current = true
    setCourses(null); setError(null)
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
          <p className="admin-meta">{courseRangeLabel(course)}{course.gun_utc ? ` · Gun ${formatUtcTime(course.gun_utc)} UTC` : ''}</p>
          {course.source_filename && <p className="admin-meta">Source: {course.source_filename}</p>}
        </div>
        <div className="admin-actions"><button type="button" className="danger" disabled={busy} onClick={() => void detach(course)}>Detach</button></div>
      </li>)}
    </ul>}
    {error && <p className="admin-error" role="alert">{error}</p>}
  </section>
}
