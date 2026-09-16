import { useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { TrackSample } from '../types/track'
import IndividualSogCogChart from './IndividualSogCogChart'

export interface IndividualAnalysisActivity {
  id: string
  label: string
  samples: TrackSample[] | null
  colorRole: keyof typeof ACTIVITY_COLORS
}

interface IndividualAnalysisProps {
  primaryActivity: IndividualAnalysisActivity
  comparisonActivity?: IndividualAnalysisActivity
  playbackTime: number | null
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
}: {
  activities: IndividualAnalysisActivity[]
  playbackTime: number | null
}) {
  return (
    <div className="individual-analysis__content">
      {activities.map((activity) => (
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
        </section>
      ))}
    </div>
  )
}

export default function IndividualAnalysis({
  primaryActivity,
  comparisonActivity,
  playbackTime,
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
            Inspect SOG and COG for each selected Activity.
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
          />
        </div>
      )}
    </section>
  )
}
