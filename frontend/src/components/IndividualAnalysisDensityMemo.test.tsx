// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import * as heelSogDensity from '../utils/heelSogDensity'
import { IndividualAnalysisContent, type IndividualAnalysisActivity } from './IndividualAnalysis'

vi.mock('../utils/heelSogDensity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/heelSogDensity')>()
  return {
    ...actual,
    buildHeelSogDensityPresentation: vi.fn(actual.buildHeelSogDensityPresentation),
  }
})

const buildDensity = vi.mocked(heelSogDensity.buildHeelSogDensityPresentation)

function sample(second: number, sog: number, heel: number): TrackSample {
  return {
    utc: new Date(Date.UTC(2026, 8, 5, 12, 0, second)).toISOString(),
    lat: 39,
    lon: 2,
    dist: second * sog,
    sog,
    cog: 120,
    hdg: null,
    heel,
    trim: null,
  }
}

const primaryCanonical = Array.from({ length: 30 }, (_, second) => sample(second, 5 + second / 10, 4 + second % 7))
const comparisonCanonical = Array.from({ length: 30 }, (_, second) => sample(second, 6 - second / 20, -3 - second % 5))
const fullWindow: AnalysisWindowRange = {
  start: Date.parse(primaryCanonical[0].utc),
  end: Date.parse(primaryCanonical[29].utc),
}
const narrowedWindow: AnalysisWindowRange = {
  start: Date.parse(primaryCanonical[5].utc),
  end: Date.parse(primaryCanonical[20].utc),
}

// Mirrors SessionViewerPage: fresh activity objects and array on every render.
function activitiesFor(primary: TrackSample[], comparison: TrackSample[]): IndividualAnalysisActivity[] {
  return [
    { id: 'activity-a', label: 'Sailor A', samples: primary, canonicalSamples: primary, colorRole: 'primary' },
    { id: 'activity-b', label: 'Sailor B', samples: comparison, canonicalSamples: comparison, colorRole: 'comparison' },
  ]
}

function densityMarkup(root: ParentNode) {
  return [...root.querySelectorAll('.individual-heel-sog-density')].map((node) => node.outerHTML)
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  buildDensity.mockClear()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(playbackTime: number, analysisWindow: AnalysisWindowRange, comparison = comparisonCanonical) {
  act(() => {
    root.render(
      <IndividualAnalysisContent
        activities={activitiesFor(primaryCanonical, comparison)}
        playbackTime={playbackTime}
        analysisWindow={analysisWindow}
      />,
    )
  })
}

describe('Individual Analysis density memoization (#236.1)', () => {
  it('does not recompute the density on replay frames', () => {
    render(narrowedWindow.start, narrowedWindow)
    const initialDensity = densityMarkup(container)
    expect(buildDensity).toHaveBeenCalledTimes(1)

    for (let frame = 1; frame <= 10; frame += 1) {
      render(narrowedWindow.start + frame * 1_000, narrowedWindow)
    }

    expect(buildDensity).toHaveBeenCalledTimes(1)
    expect(densityMarkup(container)).toEqual(initialDensity)
  })

  it('recomputes when the Analysis Window or a canonical track changes', () => {
    render(fullWindow.start, fullWindow)
    expect(buildDensity).toHaveBeenCalledTimes(1)

    render(narrowedWindow.start, narrowedWindow)
    expect(buildDensity).toHaveBeenCalledTimes(2)

    const replacedComparison = comparisonCanonical.map((item) => ({ ...item }))
    render(narrowedWindow.start, narrowedWindow, replacedComparison)
    expect(buildDensity).toHaveBeenCalledTimes(3)
    expect(buildDensity.mock.calls[2][0]).toEqual([primaryCanonical, replacedComparison])
  })

  it('keeps the density output after replay frames identical to a fresh render', () => {
    for (let frame = 0; frame <= 5; frame += 1) {
      render(narrowedWindow.start + frame * 1_000, narrowedWindow)
    }

    const referenceContainer = document.createElement('div')
    const referenceRoot = createRoot(referenceContainer)
    act(() => {
      referenceRoot.render(
        <IndividualAnalysisContent
          activities={activitiesFor(primaryCanonical, comparisonCanonical)}
          playbackTime={narrowedWindow.start + 5_000}
          analysisWindow={narrowedWindow}
        />,
      )
    })

    expect(densityMarkup(container)).toHaveLength(2)
    expect(densityMarkup(container)).toEqual(densityMarkup(referenceContainer))
    expect(buildDensity.mock.results.at(-1)!.value).toEqual(
      heelSogDensity.buildHeelSogDensityPresentation(
        [primaryCanonical, comparisonCanonical],
        narrowedWindow,
      ),
    )
    act(() => referenceRoot.unmount())
  })
})
