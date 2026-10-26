// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/tackbarApi'
import type { ActivityManeuverAnalytics, Maneuver } from '../types/maneuver'
import type { SharedSessionDetail } from '../types/session'
import type { ActivityTrack } from '../types/track'
import type { DisplayManeuver } from '../utils/maneuverEvents'
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
  default: () => null,
  createMapFitContextKey: () => 'test-map',
}))
vi.mock('../components/SessionShare', () => ({
  SessionViewerHeader: () => null,
  SessionSummaryHeading: () => null,
  SessionSharePanel: () => null,
}))
vi.mock('../components/VsDistributionView', () => ({ default: () => null }))
vi.mock('../components/MetricChart', () => ({ default: () => null }))
vi.mock('../components/IndividualAnalysis', () => ({ default: () => null }))
vi.mock('../components/ComparisonTable', () => ({ default: () => null }))
vi.mock('../components/MetricSelector', () => ({ default: () => null, DEFAULT_VIEWER_METRIC_VIEW: 'VS' }))
vi.mock('../components/ManeuverEventTable', () => ({
  default: ({ events, onSelect }: { events: DisplayManeuver[], onSelect: (event: DisplayManeuver) => void }) =>
    <div>{events.map((event) => <button key={`${event.activityRole}:${event.centerTimeMs}`} type="button" data-table-event={event.centerTimeMs} onClick={() => onSelect(event)}>Table event</button>)}</div>,
}))
vi.mock('../components/AnalysisWindow', () => ({
  default: ({ maneuvers, onManeuverSelect, onRangeChange, replay }: {
    maneuvers: DisplayManeuver[]
    onManeuverSelect: (event: DisplayManeuver) => void
    onRangeChange: (range: { start: number, end: number }) => void
    replay: { playbackTime: number, onTogglePlayback: () => void } | null
  }) => <section aria-label="Analysis Window test controls">
    {maneuvers.map((event) => <button key={`${event.activityRole}:${event.centerTimeMs}`} type="button" data-marker={event.centerTimeMs} onClick={() => onManeuverSelect(event)}>Timeline event</button>)}
    <button type="button" data-change-window onClick={() => onRangeChange({ start: start + 1_000, end: start + 9_000 })}>Change window</button>
    <button type="button" data-play-replay onClick={replay?.onTogglePlayback}>Play replay</button>
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
    sample_count: 2,
    sailor: { id, name: id.toUpperCase(), email: `${id}@example.test` },
    boat: null,
  })),
}

function track(activityId: string): ActivityTrack {
  return {
    activity_id: activityId,
    samples: [0, 10].map((seconds) => ({
      utc: new Date(start + seconds * 1_000).toISOString(),
      lat: 0,
      lon: 0,
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

async function mountViewer() {
  await act(async () => {
    root.render(<SessionViewer access={{ kind: 'original', token: 'test' }} session={session} />)
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

function selectedTimes() {
  return Array.from(container.querySelectorAll('.selected-maneuvers__table tbody tr'))
    .map((row) => row.querySelector('td')?.textContent)
}

const marker = (seconds: number) => `[data-marker="${start + seconds * 1_000}"]`

describe('Viewer selected maneuver interactions', () => {
  it('keeps two distinct events and leaves history unchanged on repeated selection', async () => {
    await mountViewer()
    await click(marker(2))
    await click(marker(4))
    expect(selectedTimes()).toEqual(['10:00:04', '10:00:02'])
    await click(marker(4))
    expect(selectedTimes()).toEqual(['10:00:04', '10:00:02'])
    await click('[data-table-event="' + (start + 2_000) + '"]')
    expect(selectedTimes()).toEqual(['10:00:02', '10:00:04'])
  })

  it('clears both records when the Analysis Window changes while both events stay eligible', async () => {
    await mountViewer()
    await click(marker(2))
    await click(marker(4))
    await click('[data-change-window]')
    expect(selectedTimes()).toEqual(['No latest selection', 'No previous selection'])
  })

  it('clears both records when Primary changes', async () => {
    await mountViewer()
    await choose('Compare', 'b')
    await click(marker(2))
    await click(marker(6))
    expect(selectedTimes()).toEqual(['10:00:06', '10:00:02'])
    await choose('My track', 'c')
    expect(selectedTimes()).toEqual(['No latest selection', 'No previous selection'])
  })

  it('clears both records when Comparison changes', async () => {
    await mountViewer()
    await choose('Compare', 'b')
    await click(marker(2))
    await click(marker(6))
    expect(selectedTimes()).toEqual(['10:00:06', '10:00:02'])
    await choose('Compare', 'c')
    expect(selectedTimes()).toEqual(['No latest selection', 'No previous selection'])
  })

  it('keeps both records during ordinary replay movement', async () => {
    await mountViewer()
    await click(marker(2))
    await click(marker(4))
    const before = Number(container.querySelector('output')?.getAttribute('data-playback-time'))
    await click('[data-play-replay]')
    expect(nextFrame).not.toBeNull()
    await act(async () => nextFrame!(performance.now() + 500))
    const after = Number(container.querySelector('output')?.getAttribute('data-playback-time'))
    expect(after).toBeGreaterThan(before)
    expect(selectedTimes()).toEqual(['10:00:04', '10:00:02'])
  })
})
