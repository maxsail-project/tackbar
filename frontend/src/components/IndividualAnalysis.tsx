import { useMemo, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from '../utils/analysisWindow'
import { buildHeelSogDensityPresentation } from '../utils/heelSogDensity'
import IndividualHeelSogDensityChart from './IndividualHeelSogDensityChart'
import IndividualSogCogChart from './IndividualSogCogChart'

export interface IndividualAnalysisActivity {
  id: string
  label: string
  samples: TrackSample[] | null
  canonicalSamples: TrackSample[] | null
  colorRole: keyof typeof ACTIVITY_COLORS
}

interface IndividualAnalysisProps {
  primaryActivity: IndividualAnalysisActivity
  comparisonActivity?: IndividualAnalysisActivity
  playbackTime: number | null
  analysisWindow: AnalysisWindowRange | null
}

export function toggleIndividualAnalysis(expanded: boolean) {
  return !expanded
}

export function individualAnalysisChartKey(activityId: string) {
  return `individual-sog-cog-${activityId}`
}

export function resolveIndividualSogColor(
  colorRole: IndividualAnalysisActivity['colorRole'],
) {
  return ACTIVITY_COLORS[colorRole]
}

export function IndividualAnalysisContent({
  activities,
  playbackTime,
  analysisWindow,
}: {
  activities: IndividualAnalysisActivity[]
  playbackTime: number | null
  analysisWindow: AnalysisWindowRange | null
}) {
  // Keyed on the canonical track references and the Analysis Window, not on the
  // `activities` array (rebuilt every render), so replay frames do not recompute
  // the density (#236.1). The Viewer compares at most two Activities.
  const primaryCanonicalSamples = activities[0]?.canonicalSamples ?? null
  const comparisonCanonicalSamples = activities[1]?.canonicalSamples ?? null
  const hasComparison = activities.length > 1
  const densityPresentation = useMemo(
    () => analysisWindow === null
      ? null
      : buildHeelSogDensityPresentation(
          (hasComparison
            ? [primaryCanonicalSamples, comparisonCanonicalSamples]
            : [primaryCanonicalSamples]
          ).map((canonicalSamples) => canonicalSamples ?? []),
          analysisWindow,
        ),
    [analysisWindow, comparisonCanonicalSamples, hasComparison, primaryCanonicalSamples],
  )

  return (
    <div className="individual-analysis__content">
      {activities.map((activity, index) => (
        <section
          className="individual-analysis__activity"
          key={activity.id}
        >
          <h3>{activity.label}</h3>
          <IndividualSogCogChart
            key={individualAnalysisChartKey(activity.id)}
            samples={activity.samples}
            playbackTime={playbackTime}
            activityLabel={activity.label}
            sogColor={resolveIndividualSogColor(activity.colorRole)}
          />
          {densityPresentation === null ? null : (
            <IndividualHeelSogDensityChart
              activityLabel={activity.label}
              color={resolveIndividualSogColor(activity.colorRole)}
              density={densityPresentation.activities[index]}
              geometry={densityPresentation.geometry}
              sharedMaximumCellPercentage={
                densityPresentation.sharedMaximumCellPercentage
              }
            />
          )}
        </section>
      ))}
    </div>
  )
}

export default function IndividualAnalysis({
  primaryActivity,
  comparisonActivity,
  playbackTime,
  analysisWindow,
}: IndividualAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const activities = comparisonActivity
    ? [primaryActivity, comparisonActivity]
    : [primaryActivity]

  return (
    <section
      className="content-section individual-analysis"
      aria-labelledby="individual-analysis-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="individual-analysis-heading">Individual Analysis</h2>
          <p className="section-description">
            Inspect SOG, COG and HEEL versus SOG density for each selected Activity.
          </p>
        </div>
        <button
          className="individual-analysis__toggle"
          type="button"
          aria-expanded={isExpanded}
          aria-controls="individual-analysis-content"
          onClick={() => setIsExpanded(toggleIndividualAnalysis)}
        >
          {isExpanded ? 'Hide' : 'Show'}
        </button>
      </div>
      {isExpanded && (
        <div id="individual-analysis-content">
          <IndividualAnalysisContent
            activities={activities}
            playbackTime={playbackTime}
            analysisWindow={analysisWindow}
          />
        </div>
      )}
    </section>
  )
}
