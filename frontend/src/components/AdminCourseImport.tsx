import { lazy, Suspense, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AdminApiError, attachSessionCourse, createGeoRacingCourseDraft, detachSessionCourse, findCourseSessionCandidates,
  listSessionCourses, suggestSessionCourseGun, validateCourse,
} from '../api/adminApi'
import type { AdminSessionSummary } from '../types/admin'
import {
  COURSE_ROLES, type AttachedCourseSummary, type CourseContextV1, type CourseGunSuggestion, type CourseImportDraft, type CourseRole,
  type CourseSessionCandidate,
} from '../types/course'
import {
  buildReviewedCourse, courseElements, courseFilename, editableTracks, editInterval, formatUtcInput, formatUtcTime,
  MAX_GATE_ID_LENGTH, MAX_RACE_LABEL_LENGTH, parseUtcInput, reviewIssues, validationMessages,
  type EditableInterval, type EditableTrack, type IntervalEdit, type RaceInputs,
} from '../utils/courseImport'
import CourseGunSuggestionNotice from './CourseGunSuggestionNotice'

// Admin Courses tool (Issue #242): review a GeoRacing elements GPX (242.2) and
// attach the course with its original to an explicitly chosen Session (242.3,
// D9). When exactly one Session is a candidate, validating also attaches to it
// (D13); draft load never attaches. JSON download remains a secondary option.

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

/** Overlap and distance of a candidate Session, e.g. "candidate · 30 min overlap · 0.4 km". */
export function candidateLabel(candidate: CourseSessionCandidate) {
  const distance = candidate.min_distance_m < 1000
    ? `${Math.round(candidate.min_distance_m)} m`
    : `${(candidate.min_distance_m / 1000).toFixed(1)} km`
  return `candidate · ${Math.round(candidate.overlap_seconds / 60)} min overlap · ${distance} from start line`
}

/** Human-readable Session choice; times in UTC like the rest of the tool. */
export function sessionOptionLabel(session: AdminSessionSummary, candidate?: CourseSessionCandidate) {
  const place = [session.location_label, session.location_country].filter(Boolean).join(', ') || 'Session'
  const time = session.sailing_start && session.sailing_end
    ? `${formatUtcInput(session.sailing_start).slice(0, 16)}–${formatUtcTime(session.sailing_end).slice(0, 5)} UTC`
    : 'sailing time unavailable'
  return `${place} · ${time} · ${session.total_activity_count} Activities${candidate ? ` · ${candidateLabel(candidate)}` : ''}`
}

function overlaps(a: { from: string, to: string }, b: { from: string, to: string }) {
  return Date.parse(a.from) < Date.parse(b.to) && Date.parse(b.from) < Date.parse(a.to)
}

/**
 * Candidate Sessions first in backend order (nearest start line first), then
 * Sessions whose sailing interval overlaps the course, then newest first.
 */
export function orderedSessionChoices(
  sessions: AdminSessionSummary[], range: { from: string, to: string }, candidates: CourseSessionCandidate[] = [],
) {
  const rank = new Map(candidates.map((candidate, index) => [candidate.session_id, index]))
  const overlapping = (session: AdminSessionSummary) => Boolean(session.sailing_start && session.sailing_end
    && overlaps({ from: session.sailing_start, to: session.sailing_end }, range))
  return [...sessions].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
    || Number(overlapping(b)) - Number(overlapping(a))
    || Date.parse(b.sailing_start ?? '') - Date.parse(a.sailing_start ?? ''))
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error ?? new Error('File could not be read'))
    reader.readAsDataURL(file)
  })
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

export default function AdminCourseImport({ adminKey, sessions = [], onUnauthorized, confirm = (message) => window.confirm(message) }: {
  adminKey: string
  sessions?: AdminSessionSummary[]
  onUnauthorized: (error: AdminApiError) => void
  confirm?: (message: string) => boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  // The exact file the draft was built from; attachment re-sends these bytes.
  const [draftFile, setDraftFile] = useState<File | null>(null)
  const [sessionId, setSessionId] = useState('')
  const [attachedToSession, setAttachedToSession] = useState<AttachedCourseSummary[] | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attachErrors, setAttachErrors] = useState<string[]>([])
  const [attachResult, setAttachResult] = useState<string | null>(null)
  // The automatic attachment (D13) shown with its Detach action.
  const [autoAttached, setAutoAttached] = useState<{ sessionId: string, courseId: string, raceLabel: string } | null>(null)
  const [autoNote, setAutoNote] = useState<string | null>(null)
  const [detaching, setDetaching] = useState(false)
  // Courses attached during this review: replacing them needs no confirmation.
  const attachedInReview = useRef(new Set<string>())
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<CourseGunSuggestion | null | undefined>(undefined)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<CourseSessionCandidate[] | null>(null)
  const [findingCandidates, setFindingCandidates] = useState(false)
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
      setDraftFile(file)
      resetAttachment(); setSuggestion(undefined); setSuggestionError(null)
      attachedInReview.current = new Set()
      const initialTracks = editableTracks(next)
      const initialRace = { label: next.suggested_course.race.label, gun: '', end: '' }
      setTracks(initialTracks)
      setRace(initialRace)
      setValidationErrors([]); setValidated(null)
      setSessionId(''); setAttachedToSession(null); setCandidates(null)
      void findCandidates(buildReviewedCourse(next, initialTracks, initialRace), true)
    } catch (cause) {
      setUploadError(courseDraftError(cause))
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setUploading(false) }
  }

  // Any review change invalidates a previous validation result.
  const resetAttachment = () => { setAttachResult(null); setAttachErrors([]); setAutoAttached(null); setAutoNote(null) }
  const resetResults = () => { setValidated(null); setValidationErrors([]); resetAttachment() }
  const updateTracks = (change: (items: EditableTrack[]) => EditableTrack[]) => {
    setTracks(change); resetResults(); setSuggestion(undefined)
  }
  const updateRace = (change: Partial<RaceInputs>) => {
    setRace((current) => ({ ...current, ...change })); resetResults()
  }
  const chooseSession = async (next: string) => {
    setSessionId(next); setAttachedToSession(null); setSuggestion(undefined); setSuggestionError(null); resetAttachment()
    if (!next) return
    try {
      setAttachedToSession((await listSessionCourses(adminKey, next)).courses)
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    }
  }
  // Exactly one candidate selects that Session (validation then attaches to it);
  // leaving that state drops the selection. Searching never attaches.
  const findCandidates = async (course: ReturnType<typeof buildReviewedCourse>, preselect: boolean) => {
    setFindingCandidates(true)
    try {
      const found = (await findCourseSessionCandidates(adminKey, course)).candidates
      setCandidates(found)
      if (found.length === 1) {
        if (preselect || found[0].session_id !== sessionId) await chooseSession(found[0].session_id)
      } else if (!preselect && candidates?.length === 1) await chooseSession('')
    } catch (cause) {
      setCandidates(null)
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setFindingCandidates(false) }
  }
  const updateTrack = (trackId: string, change: Partial<EditableTrack>) =>
    updateTracks((items) => items.map((item) => item.track.track_id === trackId ? { ...item, ...change } : item))

  const issues = useMemo(() => reviewIssues(tracks, race), [tracks, race])
  const previewCourse = useMemo(() => {
    const elements = courseElements(tracks)
    const reviewed = draft ? buildReviewedCourse(draft, tracks, race) : null
    return { elements, start_line: reviewed?.start_line ?? null, finish_line: reviewed?.finish_line ?? null }
  }, [draft, tracks, race])

  const autoMode = candidates?.length === 1

  const validate = async () => {
    if (!draft || issues.length > 0 || validating || attaching) return
    setValidating(true); setValidationErrors([]); setValidated(null); resetAttachment()
    const reviewed = buildReviewedCourse(draft, tracks, race)
    try {
      const result = await validateCourse(adminKey, reviewed)
      setValidated(result.course)
      if (autoMode) await attachToSingleCandidate(reviewed)
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 422) setValidationErrors(validationMessages(cause.detail))
      else if (cause instanceof AdminApiError && cause.status === 413) setValidationErrors(['The reviewed course exceeds the 1 MiB limit.'])
      else setValidationErrors([courseDraftError(cause)])
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setValidating(false) }
  }

  const failureMessages = (cause: unknown) => {
    if (cause instanceof AdminApiError && cause.status === 422) return validationMessages(cause.detail)
    if (cause instanceof AdminApiError && cause.status === 413) return ['The request exceeds the upload limit.']
    if (cause instanceof AdminApiError && cause.status === 404) return ['The selected Session no longer exists. Refresh Admin and choose again.']
    return [courseDraftError(cause)]
  }

  const sessionName = (id: string) => {
    const session = sessions.find((item) => item.id === id)
    return session ? sessionOptionLabel(session) : id
  }
  const replacedBy = (attached: AttachedCourseSummary[], range: { from: string, to: string }) =>
    attached.filter((course) => course.time_range && overlaps(course.time_range, range))
  const confirmReplace = (replaced: AttachedCourseSummary[]) =>
    confirm(`Replace ${replaced.map((course) => course.race_label ?? 'an unavailable course').join(', ')} in this Session? The replaced course and its preserved original are deleted.`)

  // D13: runs only after a successful validation of a single-candidate review.
  const attachToSingleCandidate = async (reviewed: ReturnType<typeof buildReviewedCourse>) => {
    if (!draftFile) return
    setAttaching(true)
    try {
      // Edits since draft load may change the match, so search again for the validated course.
      const found = (await findCourseSessionCandidates(adminKey, reviewed)).candidates
      setCandidates(found)
      if (found.length !== 1) {
        await chooseSession('')
        setAutoNote('Not attached: there is no longer exactly one candidate Session. Choose a Session and click Attach to Session.')
        return
      }
      const target = found[0].session_id
      setSessionId(target)
      // Read the Session's courses now so the replace rule never uses a stale list.
      const attached = (await listSessionCourses(adminKey, target)).courses
      setAttachedToSession(attached)
      const replaced = replacedBy(attached, reviewed.time_range)
      if (replaced.some((course) => !attachedInReview.current.has(course.course_id)) && !confirmReplace(replaced)) {
        setAutoNote('Not attached: the replacement was not confirmed.')
        return
      }
      const result = await attachSessionCourse(adminKey, target, draftFile.name, reviewed, await fileToBase64(draftFile))
      attachedInReview.current.add(result.course.course_id)
      setAutoAttached({ sessionId: target, courseId: result.course.course_id, raceLabel: result.course.race.label })
      setAttachedToSession((await listSessionCourses(adminKey, target)).courses)
    } catch (cause) {
      setAttachErrors(failureMessages(cause))
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setAttaching(false) }
  }

  const detachAutoAttached = async () => {
    if (!autoAttached || detaching) return
    if (!confirm(`Detach ${autoAttached.raceLabel} from the Session? Its course context and preserved original are deleted.`)) return
    setDetaching(true); setAutoNote(null)
    try {
      setAttachedToSession((await detachSessionCourse(adminKey, autoAttached.sessionId, autoAttached.courseId)).courses)
      attachedInReview.current.delete(autoAttached.courseId)
      setAutoAttached(null); setAutoNote('Detached from the Session.')
    } catch (cause) {
      setAutoNote('The course could not be detached. Try again or use the Session detail.')
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setDetaching(false) }
  }

  const suggestGun = async () => {
    if (!draft || !sessionId || issues.length > 0 || suggesting) return
    setSuggesting(true); setSuggestionError(null); setSuggestion(undefined)
    try {
      setSuggestion((await suggestSessionCourseGun(adminKey, sessionId, buildReviewedCourse(draft, tracks, race))).suggestion)
    } catch (cause) {
      setSuggestionError(failureMessages(cause).join(' '))
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setSuggesting(false) }
  }

  const attach = async () => {
    if (!draft || !draftFile || !sessionId || issues.length > 0 || attaching) return
    const replaced = replacedBy(attachedToSession ?? [], draft.time_range)
    if (replaced.length > 0 && !confirmReplace(replaced)) return
    setAttaching(true); setAttachErrors([]); setAttachResult(null)
    try {
      const result = await attachSessionCourse(adminKey, sessionId, draftFile.name, buildReviewedCourse(draft, tracks, race), await fileToBase64(draftFile))
      attachedInReview.current.add(result.course.course_id)
      const session = sessions.find((item) => item.id === sessionId)
      setAttachResult(`Attached “${result.course.race.label}” to ${session ? sessionOptionLabel(session) : 'the Session'}${result.replaced_course_ids.length ? ` · replaced ${result.replaced_course_ids.length} earlier course${result.replaced_course_ids.length === 1 ? '' : 's'}` : ''}.`)
      setAttachedToSession((await listSessionCourses(adminKey, sessionId)).courses)
    } catch (cause) {
      setAttachErrors(failureMessages(cause))
      if (cause instanceof AdminApiError && cause.status === 401) onUnauthorized(cause)
    } finally { setAttaching(false) }
  }

  const gunUtc = race.gun.trim() ? parseUtcInput(race.gun) : null
  const sessionChoices = draft ? orderedSessionChoices(sessions, draft.time_range, candidates ?? []) : []
  const candidateById = new Map((candidates ?? []).map((candidate) => [candidate.session_id, candidate]))

  const validationErrorList = validationErrors.length > 0 && <div className="admin-error" role="alert"><p>The course is not valid:</p><ul>{validationErrors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>

  return <div className="admin-course-import">
    <form className="admin-upload" aria-label="Import GeoRacing course" onSubmit={(event) => void upload(event)}>
      <h2>Import GeoRacing course</h2>
      <p className="admin-meta">One GeoRacing elements GPX (uncompressed .gpx, up to 16 MiB). Review the draft, then attach it to a Session. Nothing is stored until you attach; when exactly one Session matches, validating the review attaches it.</p>
      <div className="admin-upload__fields">
        <label>Elements GPX<input type="file" accept=".gpx" disabled={uploading} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      {uploadError && <p className="admin-error" role="alert">{uploadError}</p>}
      <div className="admin-actions"><button type="submit" className="admin-primary" disabled={uploading || validating || attaching || !file}>{uploading ? 'Reading file…' : 'Create draft'}</button></div>
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

      <section className="admin-upload admin-course-attach" aria-label="Attach to Session">
        <h2>Attach to Session</h2>
        <p className="admin-meta">
          Start line: {previewCourse.start_line ? `${previewCourse.start_line.boat} – ${previewCourse.start_line.pin}` : 'needs exactly one committee boat and one start pin'} ·
          Finish line: {previewCourse.finish_line ? `${previewCourse.finish_line.boat} – ${previewCourse.finish_line.pin}` : 'needs exactly one committee boat and one finish pin'}
        </p>
        {!autoMode && <div className="admin-upload__fields">
          <label>Session<select value={sessionId} disabled={attaching} onChange={(event) => void chooseSession(event.target.value)}>
            <option value="">Select a Session</option>
            {sessionChoices.map((session) => <option key={session.id} value={session.id}>{sessionOptionLabel(session, candidateById.get(session.id))}</option>)}
          </select></label>
        </div>}
        {findingCandidates && <p className="admin-meta" role="status">Looking for Sessions that sailed this course…</p>}
        {!findingCandidates && candidates && <p className="admin-meta" role="status">{
          autoMode
            ? `One candidate Session sailed near the start line during the course: ${sessionName(candidates[0].session_id)} · ${candidateLabel(candidates[0])}. Validating the review attaches the course to it automatically.`
            : candidates.length > 1
              ? `${candidates.length} candidate Sessions are listed first. Choose one.`
              : 'No candidate Session sailed near the start line during the course. Choose a Session explicitly.'
        }</p>}
        <div className="admin-actions">
          <button type="button" className="admin-section-action" disabled={findingCandidates || issues.length > 0}
            onClick={() => draft && void findCandidates(buildReviewedCourse(draft, tracks, race), !sessionId)}>Recheck candidates</button>
        </div>
        {sessions.length === 0 && <p className="admin-meta">No Sessions are available.</p>}
        {attachedToSession && attachedToSession.length > 0 && <p className="admin-meta">Already attached: {attachedToSession.map((course) => course.race_label ?? 'unavailable course').join(', ')}. A course overlapping this race’s time range is replaced.</p>}
        {issues.length > 0 && <div className="admin-error" role="alert"><p>Resolve before attaching:</p><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
        <div className="admin-actions">
          <button type="button" className="admin-section-action" disabled={!sessionId || suggesting || issues.length > 0 || !previewCourse.start_line} onClick={() => void suggestGun()}>{suggesting ? 'Searching crossings…' : 'Suggest gun'}</button>
        </div>
        {suggestion && <CourseGunSuggestionNotice suggestion={suggestion} onUse={(gun) => updateRace({ gun })} />}
        {suggestion === null && <p className="admin-meta" role="status">No start-line crossing was found in the course time range.</p>}
        {suggestionError && <p className="admin-error" role="alert">{suggestionError}</p>}
        {attachErrors.length > 0 && <div className="admin-error" role="alert"><p>The course could not be attached:</p><ul>{attachErrors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
        {autoMode && validationErrorList}
        <div className="admin-actions">
          {autoMode
            ? <button type="button" className="admin-primary" disabled={validating || attaching || findingCandidates || issues.length > 0} onClick={() => void validate()}>{attaching ? 'Attaching…' : validating ? 'Validating…' : 'Validate and attach'}</button>
            : <button type="button" className="admin-primary" disabled={!sessionId || attaching || issues.length > 0} onClick={() => void attach()}>{attaching ? 'Attaching…' : 'Attach to Session'}</button>}
        </div>
        {attachResult && <p role="status">{attachResult}</p>}
        {autoAttached && <>
          <p role="status">Attached to Session {sessionName(autoAttached.sessionId)} — matched automatically</p>
          <div className="admin-actions"><button type="button" className="danger" disabled={detaching || attaching} onClick={() => void detachAutoAttached()}>Detach</button></div>
        </>}
        {autoNote && <p className="admin-meta" role="status">{autoNote}</p>}
      </section>

      <section className="admin-upload admin-course-validate" aria-label="Download course JSON">
        <h2>Download course JSON (optional)</h2>
        <p className="admin-meta">A downloaded JSON is for reference only; attaching requires the original GPX.</p>
        {!autoMode && validationErrorList}
        <div className="admin-actions">
          {!autoMode && <button type="button" className="admin-section-action" disabled={validating || findingCandidates || issues.length > 0} onClick={() => void validate()}>{validating ? 'Validating…' : 'Validate course'}</button>}
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
