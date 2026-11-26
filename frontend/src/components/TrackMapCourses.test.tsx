// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import type { CSSProperties, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { COURSE_CHANGE_MARK_COLOR, COURSE_LINE_COLOR, COURSE_MARK_COLOR } from '../config/courseColors'
import type { CourseElement } from '../types/course'
import type { TrackSample } from '../types/track'
import TrackMap from './TrackMap'

vi.mock('react-map-gl/maplibre', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    default: forwardRef(function MockMap({ children }: { children: ReactNode }, ref) {
      useImperativeHandle(ref, () => ({ getLayer: () => undefined, getBearing: () => 0, fitBounds: () => undefined }))
      return <div data-map>{children}</div>
    }),
    Source: ({ id, data, children }: { id: string, data: { geometry?: { coordinates: unknown } }, children: ReactNode }) =>
      <div data-source={id} data-coordinates={JSON.stringify(data.geometry?.coordinates ?? null)}>{children}</div>,
    Layer: ({ id, paint }: { id: string, paint: Record<string, unknown> }) =>
      <div data-layer={id} data-color={String(paint['line-color'])} data-dasharray={paint['line-dasharray'] === undefined ? undefined : JSON.stringify(paint['line-dasharray'])} />,
    Marker: ({ children, style, longitude, latitude }: { children: ReactNode, style?: CSSProperties, longitude: number, latitude: number }) =>
      <div className="maplibregl-marker" data-longitude={longitude} data-latitude={latitude} style={style}>{children}</div>,
    NavigationControl: () => null,
    Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  }
})
vi.mock('./HistoricalConditionsControl', () => ({ default: () => null }))

const samples: TrackSample[] = [
  { utc: '2031-03-14T10:00:00Z', lat: 10.25, lon: -30.5, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
  { utc: '2031-03-14T10:00:01Z', lat: 10.25, lon: -30.4999, dist: 0, sog: 5, cog: 90, hdg: null, heel: null, trim: null },
]
const at = (hhmmss: string) => Date.parse(`2031-03-14T${hhmmss}Z`)
const element = (id: string, role: CourseElement['role'], label: string, positions: [string, string, number, number][]): CourseElement => ({
  id, role, gate: role === 'gate' ? 'W' : null, label,
  positions: positions.map(([from, to, lat, lon]) => ({ from: `2031-03-14T${from}Z`, to: `2031-03-14T${to}Z`, lat, lon })),
})
const course = {
  course_id: 'course-1',
  elements: [
    element('rc', 'committee_boat', 'Race committee', [['10:00:00', '10:50:00', 10.25, -30.5]]),
    element('pin', 'start_pin', 'Start Pin', [['10:00:00', '10:20:00', 10.25, -30.4986], ['10:20:00', '10:40:00', 10.2495, -30.4991]]),
    element('finish', 'finish_pin', 'Finish Pin', [['10:13:00', '10:53:00', 10.25, -30.4986]]),
    element('change', 'change_mark', 'Change Mark', [['10:25:00', '10:28:00', 10.265, -30.5]]),
  ],
  start_line: { boat: 'rc', pin: 'pin' },
  finish_line: { boat: 'rc', pin: 'finish' },
}

function render(playbackTime: number, courses = [course]) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<TrackMap
    primaryVisibleSamples={samples}
    fitContextKey="courses"
    courses={courses}
    primaryActivityIdentity="Primary"
    primaryBoatPosition={{ lat: 10.25, lon: -30.5 }}
    playbackTime={playbackTime}
    primarySog={5}
    primaryCog={90}
    primaryHeel={null}
    primaryTrim={null}
  />)
  return container
}
const labels = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.course-element-label')]
  .map((label) => label.textContent)

describe('Session course on the Viewer map', () => {
  it('draws the elements valid at playbackTime with their labels in the endpoint label style', () => {
    const map = render(at('10:05:00'))
    expect(labels(map)).toEqual(['Race committee', 'Start Pin'])
    const label = map.querySelector<HTMLElement>('.course-element-label')!
    expect(label.classList.contains('session-start-line-endpoint')).toBe(true)
    expect(label.getAttribute('aria-label')).toBe('Race committee course element')
  })

  it('switches positions exactly at interval bounds; the later interval applies where two touch', () => {
    const pinLatitude = (time: number) => render(time).querySelector('[aria-label="Start Pin course element"]')
      ?.closest('.maplibregl-marker')?.getAttribute('data-latitude')
    expect(pinLatitude(at('10:19:59'))).toBe('10.25')
    expect(pinLatitude(at('10:20:00'))).toBe('10.2495')
    expect(pinLatitude(at('10:40:00'))).toBe('10.2495')
    expect(pinLatitude(at('10:40:01'))).toBeUndefined()
    expect(labels(render(at('10:12:59')))).not.toContain('Finish Pin')
    expect(labels(render(at('10:13:00')))).toContain('Finish Pin')
  })

  it('draws the start line solid and the finish line dashed only while both ends are present', () => {
    const before = render(at('10:05:00'))
    expect(before.querySelector('[data-layer="course-start-line-layer-course-1"]')?.getAttribute('data-color')).toBe(COURSE_LINE_COLOR)
    expect(before.querySelector('[data-layer="course-start-line-layer-course-1"]')?.hasAttribute('data-dasharray')).toBe(false)
    expect(before.querySelector('[data-layer="course-finish-line-layer-course-1"]')).toBeNull()
    const both = render(at('10:15:00'))
    expect(both.querySelector('[data-layer="course-finish-line-layer-course-1"]')?.getAttribute('data-dasharray')).toBe('[2,1.5]')
    expect(JSON.parse(both.querySelector('[data-source="course-start-line-course-1"]')!.getAttribute('data-coordinates')!))
      .toEqual([[-30.4986, 10.25], [-30.5, 10.25]])
    const afterPin = render(at('10:45:00'))
    expect(afterPin.querySelector('[data-layer="course-start-line-layer-course-1"]')).toBeNull()
    expect(afterPin.querySelector('[data-layer="course-finish-line-layer-course-1"]')).not.toBeNull()
  })

  it('colors the change mark red and other elements with the course color', () => {
    const map = render(at('10:26:00'))
    const color = (label: string) => map.querySelector<HTMLElement>(`[aria-label="${label} course element"]`)?.style.background
    const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
    expect(color('Change Mark')).toBe(rgb(COURSE_CHANGE_MARK_COLOR))
    expect(color('Race committee')).toBe(rgb(COURSE_MARK_COLOR))
  })

  it('renders no course layers or labels without courses', () => {
    const withoutCourse = render(at('10:15:00'), [])
    expect(withoutCourse.querySelector('[data-source^="course-"]')).toBeNull()
    expect(labels(withoutCourse)).toEqual([])
    const defaultProps = document.createElement('div')
    defaultProps.innerHTML = renderToStaticMarkup(<TrackMap primaryVisibleSamples={samples} fitContextKey="courses"
      primaryActivityIdentity="Primary" primaryBoatPosition={{ lat: 10.25, lon: -30.5 }} playbackTime={at('10:15:00')}
      primarySog={5} primaryCog={90} primaryHeel={null} primaryTrim={null} />)
    expect(defaultProps.innerHTML).toBe(withoutCourse.innerHTML)
  })
})
