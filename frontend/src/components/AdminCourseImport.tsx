import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react'
import { AdminApiError, createGeoRacingCourseDraft, validateCourse } from '../api/adminApi'
import { COURSE_ROLES, type CourseContextV1, type CourseImportDraft, type CourseRole } from '../types/course'
import {
  buildReviewedCourse, courseElements, courseFilename, editableTracks, editInterval, formatUtcInput, formatUtcTime,
  MAX_GATE_ID_LENGTH, MAX_RACE_LABEL_LENGTH, parseUtcInput, reviewIssues, validationMessages,
  type EditableInterval, type EditableTrack, type IntervalEdit, type RaceInputs,
} from '../utils/courseImport'

// Admin Courses tool (Issue #242, increment 242.2): stateless review of a
// GeoRacing elements GPX into a downloadable course context JSON. Nothing is
// persisted or attached to a Session.

const CourseMapPreview = lazy(() => import('./CourseMapPreview'))

export const MAX_COURSE_UPLOAD_BYTES = 16 * 1024 * 1024
const ROLE_LABELS: Record<CourseRole, string> = {
  committee_boat: 'Committee boat', start_pin: 'Start pin', finish_pin: 'Finish pin', gate: 'Gate member',
  mark: 'Mark', change_mark: 'Change mark', ignored: 'Ignored',
}
const BASIS_LABELS: Record<string, string> = { name_table: 'from track name', unrecognized_name: 'unrecognized name' }

export function courseUploadValidation(file: File | null) {
  if (!file) return 'Choose one GeoRacing elements GPX file.'
  if (!/\.gpx$/i.test(file.name)) return 'Choose an uncompressed .gpx file.'
  return null
}

export function courseDraftError(error: unknown) {
  if (!(error instanceof AdminApiError) || error.status === null) return 'Cannot reach the Admin backend.'
  if (error.status === 401) return 'Admin authorization failed.'
  if (error.status === 413) return 'The file exceeds the 16 MiB limit.'
  if (error.status === 422) return `The file cannot be used as a GeoRacing elements GPX${typeof error.detail === 'string' ? `: ${error.detail}` : '.'}`
  return 'The draft request failed. Try again.'
}

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function AdminCourseImport({ adminKey, onUnauthorized }: {
  adminKey: string; onUnauthorized: (error: AdminApiError) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<CourseImportDraft | null>(null)
  const [tracks, setTracks] = useState<EditableTrack[]>([])
  const [race, setRace] = useState<RaceInputs>({ label: '', gun: '', end: '' })
  const [validating, setValidating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validated, setValidated] = useState<CourseContextV1 | null>(null)

  const upload = async (event: FormEvent) => {
    event.preventDefault()
    if (uploading) return
    const problem = courseUploadValidation(file)
    setUploadError(problem)
    if (problem || !file) return
    setUploading(true)
    try {
      const next = await createGeoRacingCourseDraft(adminKey, file)
      setDraft(next)
      setTracks(editableTracks(next))
      setRace({ label: next.suggested_course.race.label, gun: '', end: '' })
      setValidationErrors([]); setValidated(null)
    } catch (cause) {
      setUploadError(courseDraftError(cause))
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setUploading(false) }
  }

  // Any review change invalidates a previous validation result.
  const updateTracks = (change: (items: EditableTrack[]) => EditableTrack[]) => {
    setTracks(change); setValidated(null); setValidationErrors([])
  }
  const updateRace = (change: Partial<RaceInputs>) => {
    setRace((current) => ({ ...current, ...change })); setValidated(null); setValidationErrors([])
  }
  const updateTrack = (trackId: string, change: Partial<EditableTrack>) =>
    updateTracks((items) => items.map((item) => item.track.track_id === trackId ? { ...item, ...change } : item))

  const issues = useMemo(() => reviewIssues(tracks, race), [tracks, race])
  const previewCourse = useMemo(() => {
    const elements = courseElements(tracks)
    const reviewed = draft ? buildReviewedCourse(draft, tracks, race) : null
    return { elements, start_line: reviewed?.start_line ?? null, finish_line: reviewed?.finish_line ?? null }
  }, [draft, tracks, race])

  const validate = async () => {
    if (!draft || issues.length > 0 || validating) return
    setValidating(true); setValidationErrors([]); setValidated(null)
    try {
      const result = await validateCourse(adminKey, buildReviewedCourse(draft, tracks, race))
      setValidated(result.course)
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 422) setValidationErrors(validationMessages(cause.detail))
      else if (cause instanceof AdminApiError && cause.status === 413) setValidationErrors(['The reviewed course exceeds the 1 MiB limit.'])
      else setValidationErrors([courseDraftError(cause)])
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setValidating(false) }
  }

  const gunUtc = race.gun.trim() ? parseUtcInput(race.gun) : null

  return <div className="admin-course-import">
    <form className="admin-upload" aria-label="Import GeoRacing course" onSubmit={(event) => void upload(event)}>
      <h2>Import GeoRacing course</h2>
      <p className="admin-meta">One GeoRacing elements GPX (uncompressed .gpx, up to 16 MiB). Nothing is stored: review the draft, validate it and download the course JSON.</p>
      <div className="admin-upload__fields">
        <label>Elements GPX<input type="file" accept=".gpx" disabled={uploading} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      {uploadError && <p className="admin-error" role="alert">{uploadError}</p>}
      <div className="admin-actions"><button type="submit" className="admin-primary" disabled={uploading || !file}>{uploading ? 'Reading file…' : 'Create draft'}</button></div>
    </form>

    {draft && <>
      <section className="admin-upload admin-course-race" aria-label="Race">
        <h2>Race</h2>
        <p className="admin-meta">{draft.source.filename} · tracks {formatUtcInput(draft.time_range.from)}–{formatUtcTime(draft.time_range.to)} UTC. All times are UTC.</p>
        <div className="admin-upload__fields">
          <label>Race label<input value={race.label} maxLength={MAX_RACE_LABEL_LENGTH} onChange={(event) => updateRace({ label: event.target.value })} /></label>
          <label>Gun (UTC, optional)<input value={race.gun} placeholder="YYYY-MM-DD HH:MM:SS" inputMode="numeric" onChange={(event) => updateRace({ gun: event.target.value })} /></label>
          <label>Race end (UTC, optional)<input value={race.end} placeholder="YYYY-MM-DD HH:MM:SS" inputMode="numeric" onChange={(event) => updateRace({ end: event.target.value })} /></label>
        </div>
      </section>

      <section className="admin-course-tracks" aria-label="Tracks">
        <h2>Tracks</h2>
        <p className="admin-meta">Stable intervals stay within {draft.parameters.max_dispersion_m} m for at least {draft.parameters.min_duration_s} s. Relocation stretches are shown for context and never become positions.</p>
        <ol className="admin-course-track-list">
          {tracks.map((item) => <TrackRow key={item.track.track_id} item={item} tracks={tracks}
            onRole={(role) => updateTrack(item.track.track_id, { role })}
            onGate={(gate) => updateTrack(item.track.track_id, { gate })}
            onIntervals={(intervals) => updateTrack(item.track.track_id, { intervals })} />)}
        </ol>
      </section>

      <section className="admin-upload admin-course-preview" aria-label="Map preview">
        <h2>Map preview</h2>
        <Suspense fallback={<p className="admin-meta">Loading map…</p>}>
          <CourseMapPreview course={previewCourse} timeRange={draft.time_range} gunUtc={gunUtc} />
        </Suspense>
      </section>

      <section className="admin-upload admin-course-validate" aria-label="Validate and download">
        <h2>Validate and download</h2>
        <p className="admin-meta">
          Start line: {previewCourse.start_line ? `${previewCourse.start_line.boat} – ${previewCourse.start_line.pin}` : 'needs exactly one committee boat and one start pin'} ·
          Finish line: {previewCourse.finish_line ? `${previewCourse.finish_line.boat} – ${previewCourse.finish_line.pin}` : 'needs exactly one committee boat and one finish pin'}
        </p>
        {issues.length > 0 && <div className="admin-error" role="alert"><p>Resolve before validating:</p><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        {validationErrors.length > 0 && <div className="admin-error" role="alert"><p>The course is not valid:</p><ul>{validationErrors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
        <div className="admin-actions">
          <button type="button" className="admin-primary" disabled={validating || issues.length > 0} onClick={() => void validate()}>{validating ? 'Validating…' : 'Validate course'}</button>
          {validated && <button type="button" className="admin-section-action" onClick={() => downloadJson(courseFilename(validated.race.label), validated)}>Download course JSON</button>}
        </div>
        {validated && <p role="status">Valid course context · schema v{validated.schema_version} · {validated.elements.length} elements · {courseFilename(validated.race.label)}</p>}
      </section>
    </>}
  </div>
}

function TrackRow({ item, tracks, onRole, onGate, onIntervals }: {
  item: EditableTrack; tracks: EditableTrack[]
  onRole: (role: CourseRole) => void; onGate: (gate: string) => void; onIntervals: (intervals: EditableInterval[]) => void
}) {
  const { track } = item
  const duplicateOf = track.duplicate_of ? tracks.find((other) => other.track.track_id === track.duplicate_of)?.track.label ?? track.duplicate_of : null
  const relocations = track.segments.filter((segment) => segment.kind === 'relocation')
  return <li className="admin-course-track" data-track={track.track_id}>
    <div className="admin-course-track__head">
      <h3>{track.label}</h3>
      <label>Role<select value={item.role} onChange={(event) => onRole(event.target.value as CourseRole)}>
        {COURSE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
      </select></label>
      {item.role === 'gate' && <label>Gate id<input value={item.gate} maxLength={MAX_GATE_ID_LENGTH} onChange={(event) => onGate(event.target.value)} /></label>}
    </div>
    <dl className="admin-course-track__facts">
      <div><dt>Samples</dt><dd>{track.sample_count}</dd></div>
      <div><dt>First / last (UTC)</dt><dd>{formatUtcTime(track.first_utc)} – {formatUtcTime(track.last_utc)}</dd></div>
      <div><dt>Suggested</dt><dd>{ROLE_LABELS[track.suggested_role]}{track.suggested_gate ? ` ${track.suggested_gate}` : ''} · {BASIS_LABELS[track.role_basis] ?? track.role_basis}</dd></div>
      {(track.stationary || duplicateOf) && <div><dt>Flags</dt><dd>{[track.stationary && 'Never moved', duplicateOf && `Duplicate of ${duplicateOf}`].filter(Boolean).join(' · ')}</dd></div>}
    </dl>
    <details className="admin-advanced admin-course-track__intervals">
      <summary>Stable intervals ({item.intervals.length}) · relocation stretches ({relocations.length})</summary>
      <div className="admin-course-track__body">
        {item.intervals.length === 0 && <p className="admin-meta">No stable interval.</p>}
        <ul className="admin-course-intervals">
          {item.intervals.map((interval) => <IntervalRow key={interval.key} interval={interval}
            onEdit={(edit) => { const result = editInterval(item.intervals, interval.key, edit); if ('error' in result) return result.error; onIntervals(result.intervals); return null }} />)}
        </ul>
        {relocations.length > 0 && <p className="admin-meta">Relocation: {relocations.map((segment) => `${formatUtcTime(segment.from)}–${formatUtcTime(segment.to)}`).join(', ')} UTC</p>}
      </div>
    </details>
  </li>
}

function IntervalRow({ interval, onEdit }: { interval: EditableInterval; onEdit: (edit: IntervalEdit) => string | null }) {
  const [mode, setMode] = useState<'trim' | 'split' | null>(null)
  const [from, setFrom] = useState(formatUtcInput(interval.from))
  const [to, setTo] = useState(formatUtcInput(interval.to))
  const [at, setAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const open = (next: 'trim' | 'split') => { setMode(next); setError(null); setFrom(formatUtcInput(interval.from)); setTo(formatUtcInput(interval.to)); setAt('') }
  const apply = (event: FormEvent) => {
    event.preventDefault()
    const problem = onEdit(mode === 'trim' ? { kind: 'trim', from, to } : { kind: 'split', at })
    setError(problem)
    if (!problem) setMode(null)
  }
  return <li className="admin-course-interval">
    <div className="admin-course-interval__summary">
      <span>{formatUtcTime(interval.from)}–{formatUtcTime(interval.to)} UTC · {interval.lat.toFixed(6)}, {interval.lon.toFixed(6)}</span>
      <div className="admin-actions">
        <button type="button" className="admin-section-action" aria-expanded={mode === 'trim'} onClick={() => open('trim')}>Trim</button>
        <button type="button" className="admin-section-action" aria-expanded={mode === 'split'} onClick={() => open('split')}>Split</button>
        <button type="button" className="admin-section-action" onClick={() => onEdit({ kind: 'delete' })}>Delete</button>
      </div>
    </div>
    {mode && <form className="admin-upload__fields" aria-label={mode === 'trim' ? 'Trim interval' : 'Split interval'} onSubmit={apply}>
      {mode === 'trim' ? <>
        <label>From (UTC)<input value={from} inputMode="numeric" onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To (UTC)<input value={to} inputMode="numeric" onChange={(event) => setTo(event.target.value)} /></label>
      </> : <label>Split at (UTC)<input value={at} placeholder="YYYY-MM-DD HH:MM:SS" inputMode="numeric" onChange={(event) => setAt(event.target.value)} /></label>}
      <div className="admin-actions">
        <button type="submit" className="admin-primary">Apply</button>
        <button type="button" className="admin-section-action" onClick={() => setMode(null)}>Cancel</button>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <p className="admin-meta">Trim within {formatUtcTime(interval.boundsFrom)}–{formatUtcTime(interval.boundsTo)} UTC.</p>
    </form>}
  </li>
}
