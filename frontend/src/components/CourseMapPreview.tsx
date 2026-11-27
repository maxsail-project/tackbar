import { useMemo, useState } from 'react'
import Map, { Layer, Marker, Source } from 'react-map-gl/maplibre'
import { courseLinePaint } from '../config/courseColors'
import { MAP_STYLE_URL } from '../config/map'
import type { CourseTimeRange } from '../types/course'
import { formatUtcTime } from '../utils/courseImport'
import { courseStateAt, type CourseLineAt, type CourseShape } from '../utils/courseState'
import CourseElementLabel from './CourseElementLabel'

// Admin course preview (Issue #242, increment 242.2): elements valid at the
// slider time, their labels, and the start/finish line when both ends exist.

const LINE_LAYOUT = { 'line-cap': 'round', 'line-join': 'round' } as const

function bounds(course: CourseShape): [[number, number], [number, number]] | null {
  const points = course.elements.flatMap((element) => element.positions)
  if (points.length === 0) return null
  const lons = points.map((point) => point.lon)
  const lats = points.map((point) => point.lat)
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]
}

function LineSource({ id, line, dashed }: { id: string; line: CourseLineAt; dashed?: boolean }) {
  return <Source id={id} type="geojson" data={{
    type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: [[line.pin.lon, line.pin.lat], [line.boat.lon, line.boat.lat]] },
  }}>
    <Layer id={`${id}-layer`} type="line" layout={LINE_LAYOUT} paint={courseLinePaint(dashed ? 'finish' : 'start')} />
  </Source>
}

export default function CourseMapPreview({ course, timeRange, gunUtc }: {
  course: CourseShape; timeRange: CourseTimeRange; gunUtc: string | null
}) {
  const fromMs = Date.parse(timeRange.from)
  const toMs = Date.parse(timeRange.to)
  const [timeMs, setTimeMs] = useState(fromMs)
  const time = Math.min(Math.max(timeMs, fromMs), toMs)
  const state = useMemo(() => courseStateAt(course, time), [course, time])
  const courseBounds = useMemo(() => bounds(course), [course])
  const gunMs = gunUtc ? Date.parse(gunUtc) : null
  const gunInRange = gunMs !== null && gunMs >= fromMs && gunMs <= toMs
  const gunPercent = gunInRange ? ((gunMs - fromMs) / Math.max(1, toMs - fromMs)) * 100 : null

  return <div className="admin-course-map">
    <div className="admin-course-map__canvas">
      {courseBounds ? <Map
        initialViewState={{ bounds: courseBounds, fitBoundsOptions: { padding: 48, maxZoom: 16 } }}
        mapStyle={MAP_STYLE_URL}
        attributionControl={{ compact: true }}
        dragRotate={false}
      >
        {state.startLine && <LineSource id="course-start-line" line={state.startLine} />}
        {state.finishLine && <LineSource id="course-finish-line" line={state.finishLine} dashed />}
        {state.elements.map((element) => (
          <Marker key={element.id} longitude={element.lon} latitude={element.lat} anchor="center" style={{ zIndex: 2 }}>
            <CourseElementLabel element={element} />
          </Marker>
        ))}
      </Map> : <p className="admin-meta">No stable positions to preview.</p>}
    </div>
    <div className="admin-course-map__time">
      <label htmlFor="course-preview-time">Preview time <strong>{formatUtcTime(time)} UTC</strong></label>
      <div className="admin-course-map__slider">
        <input id="course-preview-time" type="range" min={fromMs} max={toMs} step={1000} value={time}
          onChange={(event) => setTimeMs(Number(event.target.value))} />
        {gunPercent !== null && <span className="admin-course-map__gun" style={{ left: `${gunPercent}%` }} aria-hidden="true" title="Gun" />}
      </div>
      <div className="admin-course-map__range admin-meta">
        <span>{formatUtcTime(fromMs)} UTC</span>
        {gunInRange && <button type="button" className="admin-section-action" onClick={() => setTimeMs(gunMs)}>Gun {formatUtcTime(gunMs)} UTC</button>}
        <span>{formatUtcTime(toMs)} UTC</span>
      </div>
      <p className="admin-meta" role="status">
        {state.elements.length} element{state.elements.length === 1 ? '' : 's'} at this time
        {state.startLine ? ' · start line' : ''}{state.finishLine ? ' · finish line' : ''}
      </p>
    </div>
  </div>
}
