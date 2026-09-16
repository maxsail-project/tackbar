import { describe, expect, it } from 'vitest'
import {
  createTemporalRange,
  resolveTemporalZoomChartPresentation,
  selectTemporalZoom,
} from './metricChartZoom'

describe('metric chart temporal zoom', () => {
  const fullRange = { start: 1_000, end: 5_000 }

  it('uses the complete incoming timestamp interval initially', () => {
    expect(createTemporalRange([5_000, 1_000, 3_000])).toEqual(fullRange)
  })

  it('creates a valid shorter range from a selection', () => {
    expect(selectTemporalZoom(fullRange, 2_000, 4_000)).toEqual({ start: 2_000, end: 4_000 })
  })

  it('normalizes a reverse drag without creating an invalid range', () => {
    expect(selectTemporalZoom(fullRange, 4_000, 2_000)).toEqual({ start: 2_000, end: 4_000 })
  })

  it('rejects empty and full-range selections', () => {
    expect(selectTemporalZoom(fullRange, 2_000, 2_000)).toBeNull()
    expect(selectTemporalZoom(fullRange, 1_000, 5_000)).toBeNull()
  })

  it('clamps selections to the incoming interval', () => {
    expect(selectTemporalZoom(fullRange, 0, 2_000)).toEqual({ start: 1_000, end: 2_000 })
  })

  it('does not retain a range when the incoming timestamps change', () => {
    const priorZoom = selectTemporalZoom(fullRange, 2_000, 4_000)
    const replacementRange = createTemporalRange([6_000, 8_000])

    expect(selectTemporalZoom(replacementRange, priorZoom?.start ?? null, priorZoom?.end ?? null)).toBeNull()
  })

  it('does not alter the incoming temporal data', () => {
    const timestamps = [1_000, 2_000, 5_000]
    const originalRange = createTemporalRange(timestamps)

    selectTemporalZoom(originalRange, 2_000, 4_000)

    expect(timestamps).toEqual([1_000, 2_000, 5_000])
    expect(originalRange).toEqual(fullRange)
  })

  it('makes a zoomed domain authoritative without changing playback time', () => {
    const playbackTime = 5_000

    expect(resolveTemporalZoomChartPresentation({ start: 2_000, end: 4_000 })).toEqual({
      domain: [2_000, 4_000],
      allowDataOverflow: true,
      playbackReferenceOverflow: 'discard',
    })
    expect(playbackTime).toBe(5_000)
  })

  it('restores the original domain and playback-line behavior on reset', () => {
    expect(resolveTemporalZoomChartPresentation(null)).toEqual({
      domain: ['dataMin', 'dataMax'],
      allowDataOverflow: false,
      playbackReferenceOverflow: 'extendDomain',
    })
  })
})
