import { describe, expect, it } from 'vitest'
import {
  createTemporalRange,
  finishTemporalPointerSelection,
  resolveTemporalPointerTimestamp,
  resolveTemporalZoomChartPresentation,
  selectTemporalZoom,
  startTemporalPointerSelection,
  updateTemporalPointerSelection,
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

  it('maps a pointer position on the visible x axis to a GPS timestamp', () => {
    expect(resolveTemporalPointerTimestamp(fullRange, 150, { left: 100, right: 200 })).toBe(3_000)
    expect(resolveTemporalPointerTimestamp(fullRange, 80, { left: 100, right: 200 })).toBe(1_000)
    expect(resolveTemporalPointerTimestamp(fullRange, 240, { left: 100, right: 200 })).toBe(5_000)
  })

  it('starts, extends and completes a pointer selection as one local temporal zoom', () => {
    const selection = startTemporalPointerSelection(
      7,
      resolveTemporalPointerTimestamp(fullRange, 125, { left: 100, right: 200 }),
    )
    const extendedSelection = updateTemporalPointerSelection(
      selection,
      7,
      resolveTemporalPointerTimestamp(fullRange, 175, { left: 100, right: 200 }),
    )

    expect(selection).toEqual({ pointerId: 7, start: 2_000, end: 2_000 })
    expect(extendedSelection).toEqual({ pointerId: 7, start: 2_000, end: 4_000 })
    expect(finishTemporalPointerSelection(fullRange, extendedSelection, 7, 4_000)).toEqual({
      start: 2_000,
      end: 4_000,
    })
  })

  it('does not complete a cancelled or unrelated pointer selection', () => {
    const selection = startTemporalPointerSelection(7, 2_000)

    expect(updateTemporalPointerSelection(selection, 8, 4_000)).toBe(selection)
    expect(finishTemporalPointerSelection(fullRange, null, 7, 4_000)).toBeNull()
    expect(finishTemporalPointerSelection(fullRange, selection, 8, 4_000)).toBeNull()
  })
})
