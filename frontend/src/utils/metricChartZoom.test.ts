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

  it('handles a large unsorted timestamp collection without argument expansion', () => {
    const timestamps = Array.from({ length: 150_000 }, (_, index) => index + 1_000)
    timestamps[0] = 200_000
    timestamps[timestamps.length - 1] = -500

    expect(() => createTemporalRange(timestamps)).not.toThrow()
    expect(createTemporalRange(timestamps)).toEqual({ start: -500, end: 200_000 })
  })

  it('ignores non-finite timestamps and returns null when none are finite', () => {
    expect(createTemporalRange([Number.NaN, 5_000, Number.POSITIVE_INFINITY, 1_000, Number.NEGATIVE_INFINITY]))
      .toEqual(fullRange)
    expect(createTemporalRange([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]))
      .toBeNull()
  })

  it('does not mutate timestamps while creating their temporal range', () => {
    const timestamps = [5_000, Number.NaN, 1_000, Number.POSITIVE_INFINITY, 3_000]
    const originalTimestamps = [...timestamps]

    createTemporalRange(timestamps)

    expect(timestamps).toEqual(originalTimestamps)
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
