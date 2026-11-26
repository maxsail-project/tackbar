import type {
  CourseDraftTrack, CourseElement, CourseImportDraft, CourseLine, CoursePosition, CourseRole, ReviewedCourse,
} from '../types/course'

// Admin review state for a GeoRacing course draft (Issue #242, increment 242.2).
// Only stable intervals become positions; relocation stretches never do.

export interface EditableInterval extends CoursePosition {
  key: string
  // Trim bounds: the original stable segment, narrowed by splits.
  boundsFrom: string
  boundsTo: string
}

export interface EditableTrack {
  track: CourseDraftTrack
  role: CourseRole
  gate: string
  intervals: EditableInterval[]
}

export interface RaceInputs { label: string; gun: string; end: string }

export const MAX_GATE_ID_LENGTH = 32
export const MAX_RACE_LABEL_LENGTH = 120

let intervalCounter = 0
const nextKey = () => `interval-${++intervalCounter}`

export function editableTracks(draft: CourseImportDraft): EditableTrack[] {
  const suggested = new Map(draft.suggested_course.elements.map((element) => [element.id, element]))
  return draft.tracks.map((track) => {
    const element = suggested.get(track.element_id)
    return {
      track,
      role: element?.role ?? 'ignored',
      gate: element?.gate ?? track.suggested_gate ?? '',
      intervals: track.segments
        .filter((segment) => segment.kind === 'stable' && segment.lat !== null && segment.lon !== null)
        .map((segment) => ({
          key: nextKey(), from: segment.from, to: segment.to, lat: segment.lat!, lon: segment.lon!,
          boundsFrom: segment.from, boundsTo: segment.to,
        })),
    }
  })
}

// --- Explicit UTC entry and display (never the browser's local time zone) ---

const UTC_INPUT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?Z?$/

/** Parse "YYYY-MM-DD HH:MM[:SS]" (optional "T"/"Z") as UTC; null when invalid. */
export function parseUtcInput(value: string): string | null {
  const match = UTC_INPUT.exec(value.trim())
  if (!match) return null
  const [year, month, day, hour, minute, second = '0'] = match.slice(1).map((part) => part ?? '0')
  const parts = [year, month, day, hour, minute, second].map(Number)
  const ms = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])
  const date = new Date(ms)
  if (
    date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]
    || date.getUTCHours() !== parts[3] || date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== parts[5]
  ) return null
  return isoUtc(ms)
}

export function isoUtc(ms: number) {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

/** "YYYY-MM-DD HH:MM:SS" in UTC, the editable input form. */
export function formatUtcInput(value: string) {
  return new Date(value).toISOString().slice(0, 19).replace('T', ' ')
}

/** "HH:MM:SS" in UTC for compact display. */
export function formatUtcTime(value: string | number) {
  return new Date(value).toISOString().slice(11, 19)
}

// --- Interval editing ---

export type IntervalEdit =
  | { kind: 'trim'; from: string; to: string }
  | { kind: 'split'; at: string }
  | { kind: 'delete' }

/** Apply an edit to one interval; returns the new list or an error message. */
export function editInterval(
  intervals: EditableInterval[], key: string, edit: IntervalEdit,
): { intervals: EditableInterval[] } | { error: string } {
  const index = intervals.findIndex((interval) => interval.key === key)
  if (index < 0) return { error: 'Interval not found.' }
  const interval = intervals[index]
  const replace = (items: EditableInterval[]) => ({ intervals: [...intervals.slice(0, index), ...items, ...intervals.slice(index + 1)] })
  if (edit.kind === 'delete') return replace([])
  if (edit.kind === 'trim') {
    const from = parseUtcInput(edit.from)
    const to = parseUtcInput(edit.to)
    if (!from || !to) return { error: 'Enter both times as YYYY-MM-DD HH:MM:SS UTC.' }
    if (Date.parse(from) < Date.parse(interval.boundsFrom) || Date.parse(to) > Date.parse(interval.boundsTo)) {
      return { error: `Trim must stay within ${formatUtcTime(interval.boundsFrom)}–${formatUtcTime(interval.boundsTo)} UTC.` }
    }
    if (Date.parse(to) <= Date.parse(from)) return { error: 'The end must be after the start.' }
    return replace([{ ...interval, from, to }])
  }
  const at = parseUtcInput(edit.at)
  if (!at) return { error: 'Enter the split time as YYYY-MM-DD HH:MM:SS UTC.' }
  if (!(Date.parse(interval.from) < Date.parse(at) && Date.parse(at) < Date.parse(interval.to))) {
    return { error: `Split inside ${formatUtcTime(interval.from)}–${formatUtcTime(interval.to)} UTC.` }
  }
  // Both halves keep the same median position; they touch at the split time.
  return replace([
    { ...interval, key: nextKey(), to: at, boundsTo: at },
    { ...interval, key: nextKey(), from: at, boundsFrom: at },
  ])
}

// --- Building the reviewed course ---

function singleId(elements: CourseElement[], role: CourseRole) {
  const matches = elements.filter((element) => element.role === role)
  return matches.length === 1 ? matches[0].id : null
}

function line(elements: CourseElement[], pinRole: CourseRole): CourseLine | null {
  const boat = singleId(elements, 'committee_boat')
  const pin = singleId(elements, pinRole)
  return boat && pin ? { boat, pin } : null
}

export function courseElements(tracks: EditableTrack[]): CourseElement[] {
  return tracks.filter((item) => item.role !== 'ignored').map((item) => ({
    id: item.track.element_id,
    role: item.role as CourseElement['role'],
    gate: item.role === 'gate' ? item.gate.trim() : null,
    label: item.track.label,
    positions: [...item.intervals]
      .sort((a, b) => Date.parse(a.from) - Date.parse(b.from))
      .map(({ from, to, lat, lon }) => ({ from, to, lat, lon })),
  }))
}

export function buildReviewedCourse(draft: CourseImportDraft, tracks: EditableTrack[], race: RaceInputs): ReviewedCourse {
  const elements = courseElements(tracks)
  const suggestedReasons = new Map(draft.suggested_course.ignored_tracks.map((item) => [item.label, item.reason]))
  const gun = race.gun.trim() ? parseUtcInput(race.gun) : null
  const end = race.end.trim() ? parseUtcInput(race.end) : null
  return {
    schema_version: 1,
    course_id: null,
    source: draft.source,
    race: { label: race.label.trim(), gun_utc: gun, gun_source: gun ? 'admin_entered' : null, end_utc: end },
    time_range: draft.time_range,
    start_line: line(elements, 'start_pin'),
    finish_line: line(elements, 'finish_pin'),
    elements,
    ignored_tracks: tracks.filter((item) => item.role === 'ignored').map((item) => ({
      label: item.track.label, reason: suggestedReasons.get(item.track.label) ?? 'admin_ignored',
    })),
  }
}

/** Problems to resolve before validation; the backend remains authoritative. */
export function reviewIssues(tracks: EditableTrack[], race: RaceInputs): string[] {
  const issues: string[] = []
  if (!race.label.trim()) issues.push('Enter a race label.')
  else if (race.label.trim().length > MAX_RACE_LABEL_LENGTH) issues.push(`The race label is limited to ${MAX_RACE_LABEL_LENGTH} characters.`)
  if (race.gun.trim() && !parseUtcInput(race.gun)) issues.push('Enter the gun as YYYY-MM-DD HH:MM:SS UTC.')
  if (race.end.trim() && !parseUtcInput(race.end)) issues.push('Enter the race end as YYYY-MM-DD HH:MM:SS UTC.')
  for (const item of tracks) {
    if (item.role === 'ignored') continue
    if (item.intervals.length === 0) issues.push(`${item.track.label} has role ${item.role} but no remaining stable interval. Ignore it or keep an interval.`)
    if (item.role === 'gate' && !item.gate.trim()) issues.push(`${item.track.label} needs a gate id.`)
    if (item.role === 'gate' && item.gate.trim().length > MAX_GATE_ID_LENGTH) issues.push(`${item.track.label}: the gate id is limited to ${MAX_GATE_ID_LENGTH} characters.`)
  }
  return issues
}

/** Download filename derived from the race label. */
export function courseFilename(label: string) {
  const slug = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return `${slug || 'course'}.course.json`
}

/** Readable lines for a FastAPI 422 detail (string or validation error list). */
export function validationMessages(detail: unknown): string[] {
  if (typeof detail === 'string') return [detail]
  if (!Array.isArray(detail)) return ['The course is not valid.']
  return detail.map((item) => {
    const entry = item as { loc?: unknown[]; msg?: string }
    const path = (entry.loc ?? []).filter((part) => part !== 'body').join(' › ')
    const message = (entry.msg ?? 'Invalid value').replace(/^Value error, /, '')
    return path ? `${path}: ${message}` : message
  })
}
