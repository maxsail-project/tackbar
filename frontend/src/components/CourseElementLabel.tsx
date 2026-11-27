import type { CourseElementAt } from '../utils/courseState'

/**
 * Course element marker (Issue #242 D8): the Session start-line endpoint style
 * (`.session-start-line-endpoint`) as a pill that grows to fit the GPX label,
 * ellipsized beyond a maximum width with the full label as accessible name and
 * tooltip. Shared by the Viewer map and the Admin Courses preview.
 */
export default function CourseElementLabel({ element }: { element: CourseElementAt }) {
  return <span className="session-start-line-endpoint course-element-label" data-role={element.role}
    style={{ background: element.color }} role="img" aria-label={`${element.label} course element`} title={element.label}>
    <span className="course-element-label__text">{element.label}</span>
  </span>
}
