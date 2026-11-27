import { useState } from 'react'
import type { CourseGunSuggestion } from '../types/course'
import { formatUtcInput, formatUtcTime } from '../utils/courseImport'

export const GUN_COPIED_NOTE = 'Copied to the gun field — adjust to the official gun if needed'

/**
 * A gun suggestion (Issue #242 D2), shared by the Courses tool and the attached
 * course editor (D14). "Use as gun" only copies the value into the editable gun
 * field; it never saves, validates or attaches.
 */
export default function CourseGunSuggestionNotice({ suggestion, onUse }: {
  suggestion: CourseGunSuggestion
  /** Receives the suggested gun in the "YYYY-MM-DD HH:MM:SS" UTC input form. */
  onUse: (gun: string) => void
}) {
  // The suggestion last copied, so a new suggestion starts without the note.
  const [copied, setCopied] = useState<CourseGunSuggestion | null>(null)
  const use = () => {
    onUse(formatUtcInput(suggestion.gun_utc))
    setCopied(suggestion)
  }
  return <div className="admin-course-suggestion" role="status">
    <p>Suggested gun: <strong>{formatUtcInput(suggestion.gun_utc)} UTC</strong> — earliest start-line crossing by a member Activity ({formatUtcTime(suggestion.crossing_utc)} UTC). A suggestion only; the gun is what you enter.</p>
    <div className="admin-actions"><button type="button" className="admin-section-action" onClick={use}>Use as gun</button></div>
    {copied === suggestion && <p className="admin-meta">{GUN_COPIED_NOTE}</p>}
  </div>
}
