import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { filterSamplesByAnalysisWindow } from './analysisWindow'
import {
  formatAverageSog,
  formatHeelValue,
  formatMetricValue,
  resolveReplayPresentation,
  selectedReplayMetricValue,
} from './metricPresentation'
import { timestampToMilliseconds } from './replay'

const samples: TrackSample[] = [
  { utc: '2031-06-15T13:02:50Z', lat: 0, lon: 0, dist: 0, sog: 99, cog: 1, hdg: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:00Z', lat: 10, lon: 20, dist: 1, sog: 4, cog: 100, hdg: null, heel: 7.2, trim: null },
  { utc: '2031-06-15T13:03:10Z', lat: 12, lon: 24, dist: 1, sog: 8, cog: 120, hdg: null, heel: -6.3, trim: null },
  { utc: '2031-06-15T13:03:20Z', lat: 14, lon: 28, dist: 1, sog: 6, cog: 140, hdg: null, heel: null, trim: null },
  { utc: '2031-06-15T13:03:30Z', lat: 50, lon: 60, dist: 1, sog: 88, cog: 359, hdg: null, heel: null, trim: null },
]
const windowStart = timestampToMilliseconds(samples[1].utc)
const windowEnd = timestampToMilliseconds(samples[3].utc)
const windowSamples = filterSamplesByAnalysisWindow(samples, windowStart, windowEnd)

describe('selected replay metric presentation', () => {
  it('resolves SOG, COG, and HEEL from the same nearest window sample', () => {
    const result = resolveReplayPresentation(
      windowSamples,
      windowStart + 8_000,
    )

    expect(result.sog).toBe(8)
    expect(result.cog).toBe(120)
    expect(result.heel).toBe(-6.3)
    expect(formatMetricValue('SOG', result.sog)).toBe('8.0 kt')
    expect(formatMetricValue('COG', result.cog)).toBe('120.0°')
  })

  it('preserves positive, negative, and unavailable HEEL presentation', () => {
    expect(resolveReplayPresentation(windowSamples, windowStart).heel).toBe(7.2)
    expect(resolveReplayPresentation(windowSamples, windowStart + 10_000).heel)
      .toBe(-6.3)
    expect(resolveReplayPresentation(windowSamples, windowEnd).heel).toBeNull()

    expect(formatHeelValue(7.2)).toBe('7.2°')
    expect(formatHeelValue(-7.2)).toBe('-7.2°')
    expect(formatHeelValue(null)).toBe('—')
  })

  it('preserves nullable SOG and COG independently', () => {
    const nullableSamples: TrackSample[] = [
      { ...samples[1], sog: null, cog: 242 },
      { ...samples[2], sog: 5.5, cog: null },
    ]

    expect(resolveReplayPresentation(nullableSamples, windowStart))
      .toMatchObject({ sog: null, cog: 242 })
    expect(resolveReplayPresentation(nullableSamples, windowStart + 10_000))
      .toMatchObject({ sog: 5.5, cog: null })
  })

  it('resolves primary and comparison independently at one shared playbackTime', () => {
    const comparisonSamples: TrackSample[] = [
      { utc: '2031-06-15T13:03:02Z', lat: 30, lon: 40, dist: 0, sog: 3, cog: 200, hdg: null, heel: null, trim: null },
      { utc: '2031-06-15T13:03:12Z', lat: 32, lon: 44, dist: 1, sog: 7, cog: 220, hdg: null, heel: null, trim: null },
    ]
    const sharedPlaybackTime = windowStart + 10_000

    expect(resolveReplayPresentation(windowSamples, sharedPlaybackTime))
      .toMatchObject({ sog: 8, cog: 120 })
    expect(resolveReplayPresentation(comparisonSamples, sharedPlaybackTime))
      .toMatchObject({ sog: 7, cog: 220 })
  })

  it('uses exact Analysis Window boundary samples and ignores outside neighbors', () => {
    const atStart = resolveReplayPresentation(windowSamples, windowStart)
    const atEnd = resolveReplayPresentation(windowSamples, windowEnd)

    expect(atStart).toEqual({
      position: { lat: 10, lon: 20 },
      sog: 4,
      cog: 100,
      heel: 7.2,
    })
    expect(atEnd).toEqual({
      position: { lat: 14, lon: 28 },
      sog: 6,
      cog: 140,
      heel: null,
    })
  })

  it('keeps presentation-only position interpolation unchanged', () => {
    const result = resolveReplayPresentation(windowSamples, windowStart + 5_000)

    expect(result.position).toEqual({ lat: 11, lon: 22 })
  })

  it('does not use samples outside a window when its boundaries fall between samples', () => {
    const narrowSamples = filterSamplesByAnalysisWindow(
      samples,
      windowStart + 1_000,
      windowEnd - 1_000,
    )

    expect(narrowSamples).toEqual([samples[2]])
    expect(resolveReplayPresentation(narrowSamples, windowStart + 1_000))
      .toEqual({ position: { lat: 12, lon: 24 }, sog: 8, cog: 120, heel: -6.3 })
    expect(resolveReplayPresentation(narrowSamples, windowEnd - 1_000))
      .toEqual({ position: { lat: 12, lon: 24 }, sog: 8, cog: 120, heel: -6.3 })
  })

  it('derives the selected ReplayControls metric from resolved telemetry', () => {
    const presentation = resolveReplayPresentation(
      windowSamples,
      windowStart + 8_000,
    )

    expect(selectedReplayMetricValue(presentation, 'SOG')).toBe(8)
    expect(selectedReplayMetricValue(presentation, 'COG')).toBe(120)
  })

  it('uses kt for Avg SOG and preserves unavailable presentation', () => {
    expect(formatAverageSog(5.125)).toBe('5.13 kt')
    expect(formatAverageSog(null)).toBe('—')
  })
})
