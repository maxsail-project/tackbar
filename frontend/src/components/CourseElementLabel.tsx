import type { CourseElementAt } from '../utils/courseState'

/**
 * Course element marker (Issue #242 D8): a circle identical to the Session
 * start-line endpoint marker (`.session-start-line-endpoint`, 26 × 26 px) with
 * the D8 element color and no text, and the GPX label beside it on the right.
 * The block is exactly the circle's size and the label is absolutely
 * positioned outside it, so a centre-anchored map marker keeps the circle
 * centre at the element position. The label is ellipsized beyond a maximum
 * width; the full label is the accessible name and tooltip. Nothing intercepts
 * map gestures. Shared by the Viewer map and the Admin Courses preview.
 */
export default function CourseElementLabel({ element }: { element: CourseElementAt }) {
  return <span className="course-element" data-role={element.role}
    role="img" aria-label={`${element.label} course element`} title={element.label}>
    <span className="session-start-line-endpoint course-element__mark" style={{ background: element.color }} aria-hidden="true" />
    <span className="course-element__label" aria-hidden="true">{element.label}</span>
  </span>
}
