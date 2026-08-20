import { describe, expect, it } from 'vitest'
import type { TrackSample } from '../types/track'
import { filterSamplesByAnalysisWindow } from './analysisWindow'
import {
  formatAverageSog,
  formatMetricValue,
  resolveReplayPresentation,
} from './metricPresentation'
import { timestampToMilliseconds } from './replay'

const samples: TrackSample[] = [
  { utc: '2031-06-15T13:02:50Z', lat: 0, lon: 0, dist: 0, sog: 99, cog: 1, heel: null, trim: null },
  { utc: '2031-06-15T13:03:00Z', lat: 10, lon: 20, dist: 1, sog: 4, cog: 100, heel: null, trim: null },
  { utc: '2031-06-15T13:03:10Z', lat: 12, lon: 24, dist: 1, sog: 8, cog: 120, heel: null, trim: null },
  { utc: '2031-06-15T13:03:20Z', lat: 14, lon: 28, dist: 1, sog: 6, cog: 140, heel: null, trim: null },
  { utc: '2031-06-15T13:03:30Z', lat: 50, lon: 60, dist: 1, sog: 88, cog: 359, heel: null, trim: null },
]
const windowStart = timestampToMilliseconds(samples[1].utc)
const windowEnd = timestampToMilliseconds(samples[3].utc)
const windowSamples = filterSamplesByAnalysisWindow(samples, windowStart, windowEnd)

describe('selected replay metric presentation', () => {
  it('resolves SOG and its knot presentation from the nearest window sample', () => {
    const result = resolveReplayPresentation(
      windowSamples,
      windowStart + 8_000,
      'SOG',
    )

    expect(result.metricValue).toBe(8)
    expect(formatMetricValue('SOG', result.metricValue)).toBe('8.0 kt')
  })

  it('resolves COG and its degree presentation from the nearest window sample', () => {
    const result = resolveReplayPresentation(
      windowSamples,
      windowStart + 8_000,
      'COG',
    )

    expect(result.metricValue).toBe(120)
    expect(formatMetricValue('COG', result.metricValue)).toBe('120.0°')
  })

  it('resolves primary and comparison independently at one shared playbackTime', () => {
    const comparisonSamples: TrackSample[] = [
      { utc: '2031-06-15T13:03:02Z', lat: 30, lon: 40, dist: 0, sog: 3, cog: 200, heel: null, trim: null },
      { utc: '2031-06-15T13:03:12Z', lat: 32, lon: 44, dist: 1, sog: 7, cog: 220, heel: null, trim: null },
    ]
    const sharedPlaybackTime = windowStart + 10_000

    expect(resolveReplayPresentation(windowSamples, sharedPlaybackTime, 'SOG'))
      .toMatchObject({ metricValue: 8 })
    expect(resolveReplayPresentation(comparisonSamples, sharedPlaybackTime, 'SOG'))
      .toMatchObject({ metricValue: 7 })
    expect(resolveReplayPresentation(windowSamples, sharedPlaybackTime, 'COG'))
      .toMatchObject({ metricValue: 120 })
    expect(resolveReplayPresentation(comparisonSamples, sharedPlaybackTime, 'COG'))
      .toMatchObject({ metricValue: 220 })
  })

  it('uses exact Analysis Window boundary samples and ignores outside neighbors', () => {
    const atStart = resolveReplayPresentation(windowSamples, windowStart, 'SOG')
    const atEnd = resolveReplayPresentation(windowSamples, windowEnd, 'SOG')

    expect(atStart).toEqual({ position: { lat: 10, lon: 20 }, metricValue: 4 })
    expect(atEnd).toEqual({ position: { lat: 14, lon: 28 }, metricValue: 6 })
  })

  it('does not use samples outside a window when its boundaries fall between samples', () => {
    const narrowSamples = filterSamplesByAnalysisWindow(
      samples,
      windowStart + 1_000,
      windowEnd - 1_000,
    )

    expect(narrowSamples).toEqual([samples[2]])
    expect(resolveReplayPresentation(narrowSamples, windowStart + 1_000, 'SOG'))
      .toEqual({ position: { lat: 12, lon: 24 }, metricValue: 8 })
    expect(resolveReplayPresentation(narrowSamples, windowEnd - 1_000, 'COG'))
      .toEqual({ position: { lat: 12, lon: 24 }, metricValue: 120 })
  })

  it('uses kt for Avg SOG and preserves unavailable presentation', () => {
    expect(formatAverageSog(5.125)).toBe('5.13 kt')
    expect(formatAverageSog(null)).toBe('—')
  })
})
