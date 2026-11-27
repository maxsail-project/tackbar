import type { CourseDraftSegment, CourseImportDraft } from '../types/course'

// Invented test draft in the 242.1 response shape (Issue #242).
const at = (hhmm: string) => `2031-03-14T${hhmm}:00Z`
const stable = (from: string, to: string, lat: number, lon: number): CourseDraftSegment => ({
  kind: 'stable', from: at(from), to: at(to), sample_count: 100, lat, lon, dispersion_m: 4.2,
})
const relocation = (from: string, to: string): CourseDraftSegment => ({
  kind: 'relocation', from: at(from), to: at(to), sample_count: 20, lat: null, lon: null, dispersion_m: null,
})
const source = { kind: 'georacing_elements_gpx' as const, filename: 'Synthetic Race 7_elements.gpx', sha256: '0'.repeat(64), imported_at: '2031-03-15T00:00:00Z' }
const track = (index: number, label: string, elementId: string, role: CourseImportDraft['tracks'][number]['suggested_role'], segments: CourseDraftSegment[], extra: Partial<CourseImportDraft['tracks'][number]> = {}) => ({
  track_id: `t${index}`, label, element_id: elementId, sample_count: 1800, first_utc: at('10:00'), last_utc: at('11:00'),
  suggested_role: role, suggested_gate: role === 'gate' ? 'Gate' : null, role_basis: 'name_table',
  stationary: false, duplicate_of: null, segments, ...extra,
})

export function courseDraftFixture(): CourseImportDraft {
  const position = (from: string, to: string, lat: number, lon: number) => ({ from: at(from), to: at(to), lat, lon })
  return {
    provider: 'georacing_elements_gpx',
    source,
    file_name: 'Synthetic Race 7',
    time_range: { from: at('10:00'), to: at('11:00') },
    parameters: { max_dispersion_m: 15, min_duration_s: 120, max_sample_gap_s: 120 },
    tracks: [
      track(1, 'Race committee', 'race_committee', 'committee_boat', [stable('10:00', '10:50', 10.25, -30.5), relocation('10:50', '11:00')]),
      track(2, 'Start Pin', 'start_pin', 'start_pin', [stable('10:00', '10:20', 10.25, -30.4986), relocation('10:20', '10:22'), stable('10:22', '10:40', 10.2495, -30.4991)]),
      track(3, 'Finish Pin', 'finish_pin', 'finish_pin', [relocation('10:00', '10:13'), stable('10:13', '10:53', 10.25, -30.4986)]),
      track(4, 'Gate A', 'gate_a', 'gate', [stable('10:00', '10:30', 10.2536, -30.4995)]),
      track(5, 'Spare 1', 'spare_1', 'ignored', [stable('10:00', '10:20', 10.25, -30.4986)], { duplicate_of: 't2' }),
      track(6, 'SPARE', 'spare', 'ignored', [stable('10:00', '11:00', 10.2464, -30.5073)], { stationary: true }),
    ],
    suggested_course: {
      schema_version: 1,
      course_id: null,
      source,
      race: { label: 'Synthetic Race 7', gun_utc: null, gun_source: null, end_utc: null },
      time_range: { from: at('10:00'), to: at('11:00') },
      start_line: { boat: 'race_committee', pin: 'start_pin' },
      finish_line: { boat: 'race_committee', pin: 'finish_pin' },
      elements: [
        { id: 'race_committee', role: 'committee_boat', gate: null, label: 'Race committee', positions: [position('10:00', '10:50', 10.25, -30.5)] },
        { id: 'start_pin', role: 'start_pin', gate: null, label: 'Start Pin', positions: [position('10:00', '10:20', 10.25, -30.4986), position('10:22', '10:40', 10.2495, -30.4991)] },
        { id: 'finish_pin', role: 'finish_pin', gate: null, label: 'Finish Pin', positions: [position('10:13', '10:53', 10.25, -30.4986)] },
        { id: 'gate_a', role: 'gate', gate: 'Gate', label: 'Gate A', positions: [position('10:00', '10:30', 10.2536, -30.4995)] },
      ],
      ignored_tracks: [
        { label: 'Spare 1', reason: 'duplicate_of:start_pin' },
        { label: 'SPARE', reason: 'never_moved' },
      ],
    },
  }
}
