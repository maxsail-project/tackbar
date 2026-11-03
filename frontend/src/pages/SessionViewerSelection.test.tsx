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
import type { TwdReference } from '../utils/twdReference'
import type { TwdPresentation } from '../utils/twdPresentation'
import { PLAYBACK_SPEEDS, type PlaybackSpeed } from '../utils/replay'
import { SessionViewer } from './SessionViewerPage'

vi.mock('../api/tackbarApi', () => ({
  getActivityTrackForAccess: vi.fn(),
  getActivityManeuversForAccess: vi.fn(),
  getSessionForAccess: vi.fn(),
  getSessionRaceTimerEventsForAccess: vi.fn(),
  createTemporarySessionShare: vi.fn(),
  ActivityTrackNotFoundError: class extends Error {},
  ActivityManeuverAnalyticsNotFoundError: class extends Error {},
  SessionNotFoundError: class extends Error {},
  TemporaryAccessExpiredError: class extends Error {},
  TemporaryAccessNotFoundError: class extends Error {},
  TemporaryAccessUnavailableError: class extends Error {},
}))
vi.mock('../components/TrackMap', () => ({
  default: ({ selectedManeuverHighlights, playbackTime, focusRequest, twdReference, twdPresentation, onTwdStep, onTwdAutomatic }: {
    selectedManeuverHighlights: SelectedManeuverHighlight[], playbackTime: number,
    focusRequest: { activityRole: string, requestId: number } | null,
    twdReference: TwdReference, twdPresentation: TwdPresentation,
    onTwdStep: (step: -5 | 5) => void, onTwdAutomatic: () => void,
  }) =>
    <div data-map-playback-time={playbackTime} data-focus-role={focusRequest?.activityRole ?? ''} data-focus-request={focusRequest?.requestId ?? ''} data-twd={twdPresentation.displayDegrees ?? 'unavailable'} data-twd-bearing={twdPresentation.bearing} data-twd-manual={twdPresentation.manual} data-twd-original={twdReference.status === 'available' ? twdReference.directionDegrees : 'unavailable'}>
      <button data-twd-minus onClick={() => onTwdStep(-5)}>−5</button><button data-twd-plus onClick={() => onTwdStep(5)}>+5</button><button data-twd-auto onClick={onTwdAutomatic}>Auto</button>
      {selectedManeuverHighlights.map((highlight) =>
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
vi.mock('../components/MetricSelector', () => ({ default: () => <section data-viewer-section="track-analysis" />, DEFAULT_VIEWER_METRIC_VIEW: 'VS' }))
vi.mock('../components/ManeuverEventTable', () => ({
  default: ({ events, onSelect }: { events: DisplayManeuver[], onSelect: (event: DisplayManeuver) => void }) =>
    <section data-viewer-section="maneuver-analysis">{events.map((event) => <button key={`${event.activityRole}:${event.centerTimeMs}`} type="button" data-table-event={event.centerTimeMs} onClick={() => onSelect(event)}>Table event</button>)}</section>,
}))
vi.mock('../components/AnalysisWindow', () => ({
  default: ({ maneuvers, sessionStarts, analysisWindow, availableRange, onManeuverSelect, onSessionStartSelect, onRangeChange, replay }: {
    maneuvers: DisplayManeuver[]
    sessionStarts: { label: string, time: number, activityIds: string[] }[]
    analysisWindow: { start: number, end: number } | null
    availableRange: { start: number, end: number } | null
    onManeuverSelect: (event: DisplayManeuver) => void
    onSessionStartSelect: (start: { label: string, time: number, activityIds: string[] }) => void
    onRangeChange: (range: { start: number, end: number }) => void
    replay: { playbackTime: number, speed: PlaybackSpeed, onSpeedChange: (speed: PlaybackSpeed) => void, onTogglePlayback: () => void } | null
  }) => <section aria-label="Analysis Window test controls">
    {maneuvers.map((event) => <button key={`${event.activityRole}:${event.centerTimeMs}`} type="button" data-marker={event.centerTimeMs} onClick={() => onManeuverSelect(event)}>Timeline event</button>)}
    {sessionStarts.filter((start) => analysisWindow && start.time >= analysisWindow.start && start.time <= analysisWindow.end)
      .map((start) => <button key={start.label} type="button" data-start={start.label} data-start-time={start.time} onClick={() => onSessionStartSelect(start)}>{start.label}</button>)}
    <button type="button" data-change-window onClick={() => onRangeChange({ start: start + 1_000, end: start + 9_000 })}>Change window</button>
    <button type="button" data-narrow-window onClick={() => onRangeChange({ start: start + 7_000, end: start + 10_000 })}>Narrow window</button>
    <button type="button" data-reset-window onClick={() => availableRange && onRangeChange(availableRange)}>Reset window</button>
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

const windSession: SharedSessionDetail = {
  ...session,
  historical_conditions: {
    weather_source: { provider: 'open-meteo' }, marine_source: null,
    hourly: [4, 9].map((seconds, index) => ({
      time: new Date(start + seconds * 1_000).toISOString(),
      wind_direction_10m_deg: index === 0 ? 91.6 : 180,
      air_temperature_c: null, wind_speed_10m_kn: null, wind_gusts_10m_kn: null,
      cloud_cover_pct: null, wave_height_m: null, wave_direction_deg: null, wave_period_s: null,
    })),
  },
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
  vi.mocked(api.getSessionRaceTimerEventsForAccess).mockResolvedValue({ activities: [
    { activity_id: 'a', race_timer_events: [{ timestamp: new Date(start + 5_000).toISOString(), event_type: 3 }], line_positions: [] },
    { activity_id: 'b', race_timer_events: [{ timestamp: new Date(start + 5_500).toISOString(), event_type: 3 }], line_positions: [] },
    { activity_id: 'c', race_timer_events: [], line_positions: [] },
  ] })
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

describe('Viewer TWD state', () => {
  it.each(['original', 'temporary'] as const)('resolves current-window wind and preserves a manual correction on %s access', async (accessKind) => {
    await mountViewer(accessKind, windSession)
    const mapState = () => container.querySelector('[data-twd]')!
    expect(mapState().getAttribute('data-twd')).toBe('90')
    expect(mapState().getAttribute('data-twd-original')).toBe('91.6')
    await click('[data-twd-plus]')
    expect(mapState().getAttribute('data-twd')).toBe('95')
    expect(mapState().getAttribute('data-twd-manual')).toBe('true')
    await click('[data-narrow-window]')
    expect(mapState().getAttribute('data-twd-original')).toBe('180')
    expect(mapState().getAttribute('data-twd')).toBe('95')
    await click('[data-twd-auto]')
    expect(mapState().getAttribute('data-twd')).toBe('180')
    expect(mapState().getAttribute('data-twd-manual')).toBe('false')
    await click('[data-reset-window]')
    expect(mapState().getAttribute('data-twd')).toBe('90')
    await click('[data-play-replay]')
    await act(async () => nextFrame!(performance.now() + 500))
    expect(mapState().getAttribute('data-twd')).toBe('90')
  })

  it('keeps unavailable North-up distinct from manual-only ±5° and returns to unavailable', async () => {
    await mountViewer('original', session)
    const mapState = () => container.querySelector('[data-twd]')!
    expect(mapState().getAttribute('data-twd')).toBe('unavailable')
    expect(mapState().getAttribute('data-twd-bearing')).toBe('0')
    await click('[data-twd-minus]')
    expect(mapState().getAttribute('data-twd')).toBe('355')
    await click('[data-twd-auto]')
    expect(mapState().getAttribute('data-twd')).toBe('unavailable')
    await click('[data-twd-plus]')
    expect(mapState().getAttribute('data-twd')).toBe('5')
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function mountViewer(accessKind: 'original' | 'temporary' = 'original', visibleSession: SharedSessionDetail = session) {
  await act(async () => {
    const access = accessKind === 'original'
      ? { kind: 'original' as const, token: 'test' }
      : { kind: 'temporary' as const, token: 'test', expiresAt: new Date(Date.now() + 60_000).toISOString() }
    root.render(<SessionViewer access={access} session={visibleSession} />)
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
  it.each(['original', 'temporary'] as const)('selects ranked initial P and empty C with %s access', async (accessKind) => {
    const visibleSession = { ...session, activities: session.activities.map((activity) => ({
      ...activity,
      start_time: new Date(start + (activity.id === 'c' ? 12_000 : 0)).toISOString(),
      end_time: new Date(start + (activity.id === 'b' || activity.id === 'c' ? 20_000 : 10_000)).toISOString(),
    })) }
    await mountViewer(accessKind, visibleSession)
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="My track"]')?.value).toBe('b')
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Compare"]')?.value).toBe('')
    expect([...container.querySelectorAll<HTMLOptionElement>('select[aria-label="My track"] option')].map((option) => option.value)).toEqual(['a', 'b', 'c'])
    expect(vi.mocked(api.getActivityTrackForAccess).mock.calls.some(([access, activityId]) => access.kind === accessKind && activityId === 'b')).toBe(true)
  })

  it('keeps manual P/C through metadata refresh and ordinary rerender', async () => {
    await mountViewer()
    await choose('My track', 'c')
    await choose('Compare', 'b')
    const refreshed = { ...session, activities: session.activities.map((activity) => ({
      ...activity,
      end_time: new Date(start + (activity.id === 'a' ? 100_000 : 10_000)).toISOString(),
    })) }
    await act(async () => root.render(<SessionViewer access={{ kind: 'original', token: 'test' }} session={refreshed} />))
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="My track"]')?.value).toBe('c')
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Compare"]')?.value).toBe('b')
    await click('[data-reset-window]')
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="My track"]')?.value).toBe('c')
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Compare"]')?.value).toBe('b')
  })

  it.each(['original', 'temporary'] as const)('infers Starts from every visible Activity regardless of P/C with %s access', async (accessKind) => {
    await mountViewer(accessKind)
    expect(container.querySelector('[data-start="S1"]')).not.toBeNull()
    await choose('My track', 'c')
    await choose('Compare', 'a')
    expect(container.querySelector('[data-start="S1"]')).not.toBeNull()
    expect(api.getSessionRaceTimerEventsForAccess).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.getSessionRaceTimerEventsForAccess).mock.calls[0][0].kind).toBe(accessKind)
  })

  it('filters stable Sxx labels by window, restores them on Reset, and seeks without changing selection or window', async () => {
    await mountViewer()
    expect(container.querySelector('[data-start="S1"]')).not.toBeNull()
    await click('[data-narrow-window]')
    expect(container.querySelector('[data-start="S1"]')).toBeNull()
    await click('[data-reset-window]')
    expect(container.querySelector('[data-start="S1"]')).not.toBeNull()
    await choose('Compare', 'c')
    await click('[data-play-replay]')
    await click('[data-start="S1"]')
    expect(Number(container.querySelector('output')?.getAttribute('data-playback-time'))).toBe(start + 5_250)
    expect(container.querySelector('[data-start="S1"]')).not.toBeNull()
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Compare"]')?.value).toBe('c')
    expect(mapHighlights()).toEqual([])
    expect(document.querySelector('[data-focus-role]')?.getAttribute('data-focus-role')).toBe('primary')
    const firstFocusId = Number(document.querySelector('[data-focus-request]')?.getAttribute('data-focus-request'))
    await click('[data-start="S1"]')
    expect(Number(document.querySelector('output')?.getAttribute('data-playback-time'))).toBe(start + 5_250)
    expect(Number(document.querySelector('[data-focus-request]')?.getAttribute('data-focus-request'))).toBeGreaterThan(firstFocusId)
    expect(nextFrame).not.toBeNull()
    expect(vi.mocked(globalThis.cancelAnimationFrame)).toHaveBeenCalled()
  })

  it('does not show Session Starts when selected Activities have no comparable GPS overlap', async () => {
    vi.mocked(api.getActivityTrackForAccess).mockImplementation(async (_access, activityId) => {
      const result = track(activityId)
      if (activityId === 'b') result.samples = result.samples.map((sample) => ({
        ...sample, utc: new Date(Date.parse(sample.utc) + 20_000).toISOString(),
      }))
      return result
    })
    await mountViewer()
    await choose('Compare', 'b')
    expect(container.textContent).toContain('No comparable GPS/UTC interval')
    expect(container.querySelector('[data-start="S1"]')).toBeNull()
  })

  it('discards a previous capability response after access changes', async () => {
    let resolveOriginal!: (value: { activities: { activity_id: string, race_timer_events: { timestamp: string, event_type: 3 }[], line_positions: [] }[] }) => void
    vi.mocked(api.getSessionRaceTimerEventsForAccess).mockImplementation((access) => access.token === 'old'
      ? new Promise((resolve) => { resolveOriginal = resolve })
      : Promise.resolve({ activities: [{ activity_id: 'a', race_timer_events: [
        { timestamp: new Date(start + 7_000).toISOString(), event_type: 3 },
      ], line_positions: [] }] }))
    await act(async () => root.render(<SessionViewer access={{ kind: 'original', token: 'old' }} session={session} />))
    await act(async () => root.render(<SessionViewer access={{ kind: 'original', token: 'new' }} session={session} />))
    expect(container.querySelector('[data-start-time]')?.getAttribute('data-start-time')).toBe(String(start + 7_000))
    await act(async () => resolveOriginal({ activities: [{ activity_id: 'a', race_timer_events: [
      { timestamp: new Date(start + 2_000).toISOString(), event_type: 3 },
    ], line_positions: [] }] }))
    expect(container.querySelector('[data-start-time]')?.getAttribute('data-start-time')).toBe(String(start + 7_000))
  })
  it.each(['original', 'temporary'] as const)('keeps duplicate selector labels tied to Activity IDs across roles with %s access', async (accessKind) => {
    const commonBoat = { id: 'boat-1', name: 'Shared boat', sailing_class: null, sail_number: '123' }
    const visibleSession = {
      ...session,
      activities: [...session.activities].reverse().map((activity) => ({ ...activity, boat: commonBoat })),
    }
    await mountViewer(accessKind, visibleSession)
    const options = (label: string) => [...container.querySelectorAll<HTMLOptionElement>(`select[aria-label="${label}"] option`)]
      .filter((option) => option.value)
      .map((option) => [option.value, option.textContent])
    const summaryLabels = () => [...container.querySelectorAll('.comparison-table thead th')]
      .slice(1).map((header) => header.textContent?.trim())
    const expected = [
      ['c', '123 · 10:00–10:00 #3'],
      ['b', '123 · 10:00–10:00 #2'],
      ['a', '123 · 10:00–10:00 #1'],
    ]
    expect(options('My track')).toEqual(expected)
    expect(options('Compare')).toEqual(expected.filter(([id]) => id !== 'a'))
    expect(summaryLabels()).toEqual(['123 #1'])
    await choose('Compare', 'c')
    expect(options('Compare')).toEqual(expected.filter(([id]) => id !== 'a'))
    expect(summaryLabels()).toEqual(['123 #1', '123 #3'])
    await choose('My track', 'c')
    expect(options('My track')).toEqual(expected)
    expect(options('Compare')).toEqual(expected.filter(([id]) => id !== 'c'))
    expect(summaryLabels()).toEqual(['123 #3'])
    await choose('Compare', 'a')
    expect(options('Compare').find(([id]) => id === 'a')?.[1]).toBe('123 · 10:00–10:00 #1')
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="Compare"]')?.value).toBe('a')
    expect(summaryLabels()).toEqual(['123 #3', '123 #1'])
  })

  it('shows Boat, Device and Sailor identities without hours in Summary', async () => {
    const visibleSession = { ...session, activities: session.activities.map((activity) => {
      if (activity.id === 'a') return { ...activity, boat: { id: 'boat', name: null, sailing_class: 'ILCA 7', sail_number: null } }
      if (activity.id === 'b') return { ...activity, boat: null, device_label: 'Bow watch' }
      return { ...activity, boat: null, device_name: ' ', device_label: ' ' }
    }) }
    await mountViewer('original', visibleSession)
    const summaryLabels = () => [...container.querySelectorAll('.comparison-table thead th')]
      .slice(1).map((header) => header.textContent?.trim())
    expect(summaryLabels()).toEqual(['ILCA 7'])
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="My track"]')?.selectedOptions[0].textContent).toBe('ILCA 7 · 10:00–10:00')
    await choose('Compare', 'b')
    expect(summaryLabels()).toEqual(['ILCA 7', 'Bow watch'])
    await choose('My track', 'c')
    expect(summaryLabels()).toEqual(['C', 'Bow watch'])
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="My track"]')?.selectedOptions[0].textContent).toBe('C · 10:00–10:00')
  })

  it('does not number Summary identities when TRACK labels differ by time', async () => {
    const commonBoat = { id: 'boat', name: null, sailing_class: null, sail_number: '123' }
    const visibleSession = { ...session, activities: session.activities.slice(0, 2).map((activity, index) => ({
      ...activity, boat: commonBoat,
      start_time: new Date(start + index * 60_000).toISOString(),
      end_time: new Date(start + index * 60_000 + 10_000).toISOString(),
    })) }
    await mountViewer('original', visibleSession)
    await choose('Compare', 'b')
    expect([...container.querySelectorAll('.comparison-table thead th')].slice(1).map((header) => header.textContent?.trim())).toEqual(['123', '123'])
    expect([...container.querySelectorAll<HTMLOptionElement>('select[aria-label="My track"] option')].map((option) => option.textContent)).toEqual([
      '123 · 10:00–10:00', '123 · 10:01–10:01',
    ])
  })

  it.each(['original', 'temporary'] as const)('places the independent profile section after Track Analysis and before Individual Analysis with %s access', async (accessKind) => {
    await mountViewer(accessKind)
    const selectors = [
      '[data-viewer-section="header"]',
      '[aria-label="Activity selection"]',
      '[data-map-playback-time]',
      '.selected-maneuvers',
      '[aria-label="Analysis Window test controls"]',
      '[data-viewer-section="maneuver-analysis"]',
      '[aria-labelledby="comparison-title"]',
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
