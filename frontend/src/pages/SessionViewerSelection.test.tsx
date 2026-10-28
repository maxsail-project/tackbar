// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/tackbarApi'
import type { ActivityManeuverAnalytics, Maneuver } from '../types/maneuver'
import type { SharedSessionDetail } from '../types/session'
import type { ActivityTrack } from '../types/track'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import type { SelectedManeuverHighlight } from '../utils/selectedManeuverGeometry'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '../utils/replay'
import { SessionViewer } from './SessionViewerPage'

vi.mock('../api/tackbarApi', () => ({
  getActivityTrackForAccess: vi.fn(),
  getActivityManeuversForAccess: vi.fn(),
  getSessionForAccess: vi.fn(),
  createTemporarySessionShare: vi.fn(),
  ActivityTrackNotFoundError: class extends Error {},
  ActivityManeuverAnalyticsNotFoundError: class extends Error {},
  SessionNotFoundError: class extends Error {},
  TemporaryAccessExpiredError: class extends Error {},
  TemporaryAccessNotFoundError: class extends Error {},
  TemporaryAccessUnavailableError: class extends Error {},
}))
vi.mock('../components/TrackMap', () => ({
  default: ({ selectedManeuverHighlights, playbackTime }: { selectedManeuverHighlights: SelectedManeuverHighlight[], playbackTime: number }) =>
    <div data-map-playback-time={playbackTime}>{selectedManeuverHighlights.map((highlight) =>
      <span key={highlight.selectionIndex} data-map-highlight={highlight.selectionIndex} data-role={highlight.activityRole} data-geometry={JSON.stringify(highlight.geoJson.geometry.coordinates)} />
    )}</div>,
  createMapFitContextKey: () => 'test-map',
}))
vi.mock('../components/SessionShare', () => ({
  SessionViewerHeader: () => <header data-viewer-section="header" />,
  SessionSummaryHeading: () => null,
  SessionSharePanel: () => null,
}))
vi.mock('../components/VsDistributionView', () => ({ default: () => <section data-viewer-section="vs" /> }))
vi.mock('../components/MetricChart', () => ({ default: () => null }))
vi.mock('../components/IndividualAnalysis', () => ({ default: () => <section data-viewer-section="individual-analysis" /> }))
vi.mock('../components/ComparisonTable', () => ({ default: () => <section data-viewer-section="summary" /> }))
vi.mock('../components/MetricSelector', () => ({ default: () => <section data-viewer-section="track-analysis" />, DEFAULT_VIEWER_METRIC_VIEW: 'VS' }))
vi.mock('../components/ManeuverEventTable', () => ({
  default: ({ events, onSelect }: { events: DisplayManeuver[], onSelect: (event: DisplayManeuver) => void }) =>
    <section data-viewer-section="maneuver-analysis">{events.map((event) => <button key={`${event.activityRole}:${event.centerTimeMs}`} type="button" data-table-event={event.centerTimeMs} onClick={() => onSelect(event)}>Table event</button>)}</section>,
}))
vi.mock('../components/AnalysisWindow', () => ({
  default: ({ maneuvers, onManeuverSelect, onRangeChange, replay }: {
    maneuvers: DisplayManeuver[]
    onManeuverSelect: (event: DisplayManeuver) => void
    onRangeChange: (range: { start: number, end: number }) => void
    replay: { playbackTime: number, speed: PlaybackSpeed, onSpeedChange: (speed: PlaybackSpeed) => void, onTogglePlayback: () => void } | null
  }) => <section aria-label="Analysis Window test controls">
    {maneuvers.map((event) => <button key={`${event.activityRole}:${event.centerTimeMs}`} type="button" data-marker={event.centerTimeMs} onClick={() => onManeuverSelect(event)}>Timeline event</button>)}
    <button type="button" data-change-window onClick={() => onRangeChange({ start: start + 1_000, end: start + 9_000 })}>Change window</button>
    <button type="button" data-play-replay onClick={replay?.onTogglePlayback}>Play replay</button>
    <select aria-label="Playback speed test" value={replay?.speed} onChange={(event) => replay?.onSpeedChange(Number(event.target.value) as PlaybackSpeed)}>
      {PLAYBACK_SPEEDS.map((speed) => <option key={speed} value={speed}>x{speed}</option>)}
    </select>
    <output data-playback-time={replay?.playbackTime} />
  </section>,
}))

const start = Date.UTC(2031, 0, 1, 10)
const session: SharedSessionDetail = {
  start_time: new Date(start).toISOString(),
  end_time: new Date(start + 10_000).toISOString(),
  session_access_expires_at: new Date(start + 86_400_000).toISOString(),
  location_label: null,
  location_country: null,
  historical_conditions: null,
  activities: ['a', 'b', 'c'].map((id) => ({
    id,
    source: 'test',
    device_name: 'Test device',
    original_filename: `${id}.csv`,
    start_time: new Date(start).toISOString(),
    end_time: new Date(start + 10_000).toISOString(),
    sample_count: 11,
    sailor: { id, name: id.toUpperCase(), email: `${id}@example.test` },
    boat: null,
  })),
}

function track(activityId: string): ActivityTrack {
  return {
    activity_id: activityId,
    samples: Array.from({ length: 11 }, (_, seconds) => ({
      utc: new Date(start + seconds * 1_000).toISOString(),
      lat: 0,
      lon: seconds / 1_000,
      dist: 0,
      sog: 5,
      cog: 90,
      hdg: 90,
      heel: null,
      trim: null,
    })),
  }
}

function maneuver(seconds: number): Maneuver {
  const time = new Date(start + seconds * 1_000).toISOString()
  return {
    start_time: time,
    center_time: time,
    end_time: time,
    heading_change_deg: 75,
    course_change_deg: null,
    peak_turn_rate_deg_s: null,
    peak_turn_rate_time: null,
    duration_s: 2,
    sog_entry_kn: 5,
    sog_min_kn: 4,
    sog_exit_kn: 5,
  }
}

function analytics(activityId: string): ActivityManeuverAnalytics {
  return {
    activity_id: activityId,
    status: 'available',
    detector_mode: 'HIGH',
    signal_basis: ['hdg'],
    maneuvers: (activityId === 'a' ? [2, 4] : activityId === 'b' ? [6] : [8]).map(maneuver),
  }
}

let container: HTMLDivElement
let root: Root
let nextFrame: FrameRequestCallback | null

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.mocked(api.getActivityTrackForAccess).mockImplementation(async (_access, activityId) => track(activityId))
  vi.mocked(api.getActivityManeuversForAccess).mockImplementation(async (_access, activityId) => analytics(activityId))
  nextFrame = null
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    nextFrame = callback
    return 1
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function mountViewer(accessKind: 'original' | 'temporary' = 'original') {
  await act(async () => {
    const access = accessKind === 'original'
      ? { kind: 'original' as const, token: 'test' }
      : { kind: 'temporary' as const, token: 'test', expiresAt: new Date(Date.now() + 60_000).toISOString() }
    root.render(<SessionViewer access={access} session={session} />)
  })
  expect(container.querySelector('[data-marker]')).not.toBeNull()
}

async function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => button!.click())
}

async function choose(label: string, activityId: string) {
  const selector = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)
  expect(selector).not.toBeNull()
  await act(async () => {
    selector!.value = activityId
    selector!.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function chooseSpeed(speed: PlaybackSpeed) {
  const selector = container.querySelector<HTMLSelectElement>('select[aria-label="Playback speed test"]')
  expect(selector).not.toBeNull()
  await act(async () => {
    selector!.value = String(speed)
    selector!.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function selectedTimes() {
  return Array.from(container.querySelectorAll('.selected-maneuvers__table tbody tr'))
    .map((row) => row.querySelector('td')?.textContent)
}

function mapHighlightData() {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-map-highlight]'))
    .map((highlight) => ({
      index: highlight.dataset.mapHighlight,
      role: highlight.dataset.role,
      geometry: highlight.dataset.geometry,
    }))
}

function mapHighlights() {
  return mapHighlightData().map(({ index, role }) => ({ index, role }))
}

const marker = (seconds: number) => `[data-marker="${start + seconds * 1_000}"]`

describe('Viewer selected maneuver interactions', () => {
  it.each(['original', 'temporary'] as const)('places the independent profile section after Track Analysis and before Individual Analysis with %s access', async (accessKind) => {
    await mountViewer(accessKind)
    const selectors = [
      '[data-viewer-section="header"]',
      '[aria-label="Activity selection"]',
      '[data-map-playback-time]',
      '.selected-maneuvers',
      '[aria-label="Analysis Window test controls"]',
      '[data-viewer-section="maneuver-analysis"]',
      '[data-viewer-section="summary"]',
      '[data-viewer-section="track-analysis"]',
      '[data-viewer-section="vs"]',
      '.maneuver-profiles-section',
      '[data-viewer-section="individual-analysis"]',
    ]
    const sections = selectors.map((selector) => container.querySelector(selector))
    expect(sections.every((section) => section !== null)).toBe(true)
    for (let index = 1; index < sections.length; index += 1) {
      expect(sections[index - 1]!.compareDocumentPosition(sections[index]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
    expect(container.querySelector('.maneuver-profiles-section .maneuver-section__collapse')?.getAttribute('aria-expanded')).toBe('true')
  })

  it('starts replay at x5 and retains the chosen alternative through selections and context changes', async () => {
    await mountViewer()
    const speedSelect = () => container.querySelector<HTMLSelectElement>('select[aria-label="Playback speed test"]')
    expect(speedSelect()?.value).toBe('5')
    expect(Array.from(speedSelect()!.options).map((option) => option.value)).toEqual(['1', '2', '5', '10'])

    await chooseSpeed(2)
    await click(marker(2))
    expect(speedSelect()?.value).toBe('2')
    await click('[data-change-window]')
    expect(speedSelect()?.value).toBe('2')
    await choose('My track', 'c')
    expect(speedSelect()?.value).toBe('2')
    await choose('Compare', 'b')
    expect(speedSelect()?.value).toBe('2')
    await chooseSpeed(10)
    expect(speedSelect()?.value).toBe('10')
    await chooseSpeed(1)
    expect(speedSelect()?.value).toBe('1')
  })

  it('keeps two distinct events and leaves history unchanged on repeated selection', async () => {
    await mountViewer()
    expect(mapHighlights()).toEqual([])
    await click(marker(2))
    expect(mapHighlights()).toEqual([{ index: '1', role: 'primary' }])
    await click(marker(4))
    expect(selectedTimes()).toEqual(['10:00:04', '10:00:02'])
    expect(mapHighlights()).toEqual([{ index: '1', role: 'primary' }, { index: '2', role: 'primary' }])
    await click(marker(4))
    expect(selectedTimes()).toEqual(['10:00:04', '10:00:02'])
    expect(mapHighlights()).toEqual([{ index: '1', role: 'primary' }, { index: '2', role: 'primary' }])
    await click('[data-table-event="' + (start + 2_000) + '"]')
    expect(selectedTimes()).toEqual(['10:00:02', '10:00:04'])
    expect(mapHighlights()).toEqual([{ index: '1', role: 'primary' }, { index: '2', role: 'primary' }])
  })

  it('clears both records when the Analysis Window changes while both events stay eligible', async () => {
    await mountViewer()
    await click(marker(2))
    await click(marker(4))
    await click('[data-change-window]')
    expect(selectedTimes()).toEqual(['No latest selection', 'No previous selection'])
    expect(mapHighlights()).toEqual([])
  })

  it('clears both records when Primary changes', async () => {
    await mountViewer()
    await choose('Compare', 'b')
    await click(marker(2))
    await click(marker(6))
    expect(selectedTimes()).toEqual(['10:00:06', '10:00:02'])
    expect(mapHighlights()).toEqual([{ index: '1', role: 'comparison' }, { index: '2', role: 'primary' }])
    await choose('My track', 'c')
    expect(selectedTimes()).toEqual(['No latest selection', 'No previous selection'])
    expect(mapHighlights()).toEqual([])
  })

  it('clears both records when Comparison changes', async () => {
    await mountViewer()
    await choose('Compare', 'b')
    await click(marker(2))
    await click(marker(6))
    expect(selectedTimes()).toEqual(['10:00:06', '10:00:02'])
    await choose('Compare', 'c')
    expect(selectedTimes()).toEqual(['No latest selection', 'No previous selection'])
    expect(mapHighlights()).toEqual([])
  })

  it('keeps both records during ordinary replay movement', async () => {
    await mountViewer()
    await click(marker(2))
    await click(marker(4))
    const highlightsBeforeReplay = mapHighlightData()
    const before = Number(container.querySelector('output')?.getAttribute('data-playback-time'))
    await click('[data-play-replay]')
    expect(nextFrame).not.toBeNull()
    await act(async () => nextFrame!(performance.now() + 500))
    const after = Number(container.querySelector('output')?.getAttribute('data-playback-time'))
    expect(after).toBeGreaterThan(before)
    expect(selectedTimes()).toEqual(['10:00:04', '10:00:02'])
    expect(mapHighlightData()).toEqual(highlightsBeforeReplay)
  })
})
