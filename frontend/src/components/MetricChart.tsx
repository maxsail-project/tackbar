import type { SailingMetric } from '../types/session'
import type { TrackSample } from '../types/track'
import CogSignalChart from './CogSignalChart'
import HeelSignalChart from './HeelSignalChart'
import SogSignalChart from './SogSignalChart'
import TrimSignalChart from './TrimSignalChart'

interface MetricChartProps {
  metric: SailingMetric
  primarySamples: TrackSample[] | null
  comparisonSamples?: TrackSample[] | null
  playbackTime: number | null
  primaryLabel: string
  comparisonLabel?: string
}

export default function MetricChart(props: MetricChartProps) {
  if (props.metric === 'SOG') {
    return (
      <SogSignalChart
        primarySamples={props.primarySamples}
        comparisonSamples={props.comparisonSamples}
        playbackTime={props.playbackTime}
        primaryLabel={props.primaryLabel}
        comparisonLabel={props.comparisonLabel}
      />
    )
  }

  if (props.metric === 'COG') {
    return (
      <CogSignalChart
        primarySamples={props.primarySamples}
        comparisonSamples={props.comparisonSamples}
        playbackTime={props.playbackTime}
        primaryLabel={props.primaryLabel}
        comparisonLabel={props.comparisonLabel}
      />
    )
  }

  if (props.metric === 'HEEL') {
    return (
      <HeelSignalChart
        primarySamples={props.primarySamples}
        comparisonSamples={props.comparisonSamples}
        playbackTime={props.playbackTime}
        primaryLabel={props.primaryLabel}
        comparisonLabel={props.comparisonLabel}
      />
    )
  }

  return (
    <TrimSignalChart
      primarySamples={props.primarySamples}
      comparisonSamples={props.comparisonSamples}
      playbackTime={props.playbackTime}
      primaryLabel={props.primaryLabel}
      comparisonLabel={props.comparisonLabel}
    />
  )
}
