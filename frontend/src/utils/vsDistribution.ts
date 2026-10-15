import { VS_CONFIG } from '../config/vs'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import { timestampToMilliseconds } from './replay'

export interface MetricDistribution {
  coverage: number
  eligible: boolean
  validTimeSeconds: number
}

export interface SogDistribution extends MetricDistribution {
  binTimeSeconds: ReadonlyMap<number, number>
}

export interface CogDistribution extends MetricDistribution {
  sectorPercentages: number[]
}

export interface HeelDistribution extends MetricDistribution {
  binTimeSeconds: ReadonlyMap<number, number>
}

export interface TrimStatistics {
  minimum: number
  q1: number
  median: number
  q3: number
  maximum: number
  iqr: number
  lowerWhisker: number
  upperWhisker: number
  lowOutlierPercentage: number
  highOutlierPercentage: number
}

export interface TrimDistribution extends MetricDistribution {
  statistics: TrimStatistics | null
  valueTimeSeconds: ReadonlyMap<number, number>
}

export interface ActivityVsDistribution {
  sog: SogDistribution
  cog: CogDistribution
  heel: HeelDistribution
  trim: TrimDistribution
}

export interface SogDistributionBin {
  start: number
  end: number
  center: number
  primaryPercentage: number | null
  comparisonPercentage: number | null
}

export interface HeelDistributionBin {
  start: number
  end: number
  center: number
  primaryPercentage: number | null
  comparisonPercentage: number | null
}

export interface VsDistributions {
  primary: ActivityVsDistribution
  comparison: ActivityVsDistribution | null
  sogBins: SogDistributionBin[]
  heelBins: HeelDistributionBin[]
  heelDomainMaximum: number
}

interface VsCalculationConfig {
  minCoverage: number
  maxGapSeconds: number
  sogBinKt: number
  cogBinDeg: number
  heelBinDeg: number
  heelDomainDeg: number
}

interface MutableActivityDistribution {
  sogBinTimeMs: Map<number, number>
  sogValidTimeMs: number
  cogSectorTimeMs: number[]
  cogValidTimeMs: number
  heelBinTimeMs: Map<number, number>
  heelValidTimeMs: number
  trimValueTimeMs: Map<number, number>
  trimValidTimeMs: number
}

function normalizeCog(cog: number) {
  return ((cog % 360) + 360) % 360
}

export function cogSectorIndex(cog: number, binSize: number) {
  validateCogBinSize(binSize)
  return Math.floor(((normalizeCog(cog) + binSize / 2) % 360) / binSize)
}

function validateCogBinSize(binSize: number) {
  if (
    !Number.isFinite(binSize)
    || binSize <= 0
    || !Number.isInteger(360 / binSize)
  ) {
    throw new Error('COG bin size must divide 360 evenly')
  }
}

function validateWindow(window: AnalysisWindowRange) {
  if (
    !Number.isFinite(window.start)
    || !Number.isFinite(window.end)
    || window.start >= window.end
  ) {
    throw new Error('Analysis Window start must be before end')
  }
}

function emptyMutableDistribution(cogBinCount: number): MutableActivityDistribution {
  return {
    sogBinTimeMs: new Map(),
    sogValidTimeMs: 0,
    cogSectorTimeMs: Array<number>(cogBinCount).fill(0),
    cogValidTimeMs: 0,
    heelBinTimeMs: new Map(),
    heelValidTimeMs: 0,
    trimValueTimeMs: new Map(),
    trimValidTimeMs: 0,
  }
}

function accumulateActivity(
  samples: TrackSample[],
  window: AnalysisWindowRange,
  config: VsCalculationConfig,
) {
  const cogBinCount = 360 / config.cogBinDeg
  const result = emptyMutableDistribution(cogBinCount)
  const maxGapMs = config.maxGapSeconds * 1_000

  for (let index = 0; index + 1 < samples.length; index += 1) {
    const sample = samples[index]
    const nextSample = samples[index + 1]
    const t0 = timestampToMilliseconds(sample.utc)
    const t1 = timestampToMilliseconds(nextSample.utc)
    const sourceDt = t1 - t0

    if (!Number.isFinite(sourceDt) || sourceDt <= 0 || sourceDt > maxGapMs) continue

    const representedStart = Math.max(t0, window.start)
    const representedEnd = Math.min(t1, window.end)
    const representedDt = representedEnd - representedStart
    if (representedDt <= 0) continue

    if (sample.sog !== null && Number.isFinite(sample.sog) && sample.sog >= 0) {
      const binIndex = Math.floor(sample.sog / config.sogBinKt)
      result.sogBinTimeMs.set(
        binIndex,
        (result.sogBinTimeMs.get(binIndex) ?? 0) + representedDt,
      )
      result.sogValidTimeMs += representedDt
    }

    if (sample.cog !== null && Number.isFinite(sample.cog)) {
      const binIndex = cogSectorIndex(sample.cog, config.cogBinDeg)
      result.cogSectorTimeMs[binIndex] += representedDt
      result.cogValidTimeMs += representedDt
    }

    if (
      sample.heel !== null
      && Number.isFinite(sample.heel)
      && sample.heel >= -config.heelDomainDeg
      && sample.heel < config.heelDomainDeg
    ) {
      const binIndex = Math.floor(sample.heel / config.heelBinDeg)
      result.heelBinTimeMs.set(
        binIndex,
        (result.heelBinTimeMs.get(binIndex) ?? 0) + representedDt,
      )
      result.heelValidTimeMs += representedDt
    }

    if (sample.trim !== null && Number.isFinite(sample.trim)) {
      result.trimValueTimeMs.set(
        sample.trim,
        (result.trimValueTimeMs.get(sample.trim) ?? 0) + representedDt,
      )
      result.trimValidTimeMs += representedDt
    }
  }

  return result
}

function coverage(validTimeMs: number, windowDurationMs: number) {
  return Math.min(1, Math.max(0, validTimeMs / windowDurationMs))
}

function weightedQuantile(
  entries: Array<readonly [number, number]>,
  totalWeight: number,
  quantile: number,
) {
  const targetWeight = totalWeight * quantile
  let cumulativeWeight = 0
  for (const [value, weight] of entries) {
    cumulativeWeight += weight
    if (cumulativeWeight >= targetWeight) return value
  }
  return entries.at(-1)?.[0] ?? 0
}

export function calculateWeightedTrimStatistics(
  valueTimeSeconds: ReadonlyMap<number, number>,
): TrimStatistics | null {
  const entries = Array.from(valueTimeSeconds.entries())
    .filter(([value, weight]) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0)
    .sort(([first], [second]) => first - second)
  const totalWeight = entries.reduce((total, [, weight]) => total + weight, 0)
  if (entries.length === 0 || totalWeight <= 0) return null

  const q1 = weightedQuantile(entries, totalWeight, 0.25)
  const median = weightedQuantile(entries, totalWeight, 0.5)
  const q3 = weightedQuantile(entries, totalWeight, 0.75)
  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr
  const lowerWhisker = entries.find(([value]) => value >= lowerFence)?.[0] ?? q1
  let upperWhisker = q3
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index][0] <= upperFence) {
      upperWhisker = entries[index][0]
      break
    }
  }
  const lowOutlierTime = entries.reduce(
    (total, [value, weight]) => total + (value < lowerWhisker ? weight : 0),
    0,
  )
  const highOutlierTime = entries.reduce(
    (total, [value, weight]) => total + (value > upperWhisker ? weight : 0),
    0,
  )

  return {
    minimum: entries[0][0],
    q1,
    median,
    q3,
    maximum: entries[entries.length - 1][0],
    iqr,
    lowerWhisker,
    upperWhisker,
    lowOutlierPercentage: lowOutlierTime / totalWeight * 100,
    highOutlierPercentage: highOutlierTime / totalWeight * 100,
  }
}

function finalizeActivity(
  distribution: MutableActivityDistribution,
  windowDurationMs: number,
  config: VsCalculationConfig,
): ActivityVsDistribution {
  const sogCoverage = coverage(distribution.sogValidTimeMs, windowDurationMs)
  const cogCoverage = coverage(distribution.cogValidTimeMs, windowDurationMs)
  const heelCoverage = coverage(distribution.heelValidTimeMs, windowDurationMs)
  const trimCoverage = coverage(distribution.trimValidTimeMs, windowDurationMs)
  const trimValueTimeSeconds = new Map(
    Array.from(distribution.trimValueTimeMs, ([value, timeMs]) => [value, timeMs / 1_000]),
  )

  return {
    sog: {
      coverage: sogCoverage,
      eligible: sogCoverage >= config.minCoverage,
      validTimeSeconds: distribution.sogValidTimeMs / 1_000,
      binTimeSeconds: new Map(
        Array.from(distribution.sogBinTimeMs, ([bin, timeMs]) => [bin, timeMs / 1_000]),
      ),
    },
    cog: {
      coverage: cogCoverage,
      eligible: cogCoverage >= config.minCoverage,
      validTimeSeconds: distribution.cogValidTimeMs / 1_000,
      sectorPercentages: distribution.cogSectorTimeMs.map((timeMs) => (
        distribution.cogValidTimeMs > 0
          ? timeMs / distribution.cogValidTimeMs * 100
          : 0
      )),
    },
    heel: {
      coverage: heelCoverage,
      eligible: heelCoverage >= config.minCoverage,
      validTimeSeconds: distribution.heelValidTimeMs / 1_000,
      binTimeSeconds: new Map(
        Array.from(distribution.heelBinTimeMs, ([bin, timeMs]) => [bin, timeMs / 1_000]),
      ),
    },
    trim: {
      coverage: trimCoverage,
      eligible: trimCoverage >= config.minCoverage,
      validTimeSeconds: distribution.trimValidTimeMs / 1_000,
      statistics: calculateWeightedTrimStatistics(trimValueTimeSeconds),
      valueTimeSeconds: trimValueTimeSeconds,
    },
  }
}

function eligibleSogBounds(
  distribution: ActivityVsDistribution,
): { min: number, max: number } | null {
  if (!distribution.sog.eligible || distribution.sog.binTimeSeconds.size === 0) return null

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  distribution.sog.binTimeSeconds.forEach((_time, bin) => {
    min = Math.min(min, bin)
    max = Math.max(max, bin)
  })
  return { min, max }
}

function buildSharedSogBins(
  primary: ActivityVsDistribution,
  comparison: ActivityVsDistribution | null,
  binSize: number,
) {
  const primaryBounds = eligibleSogBounds(primary)
  const comparisonBounds = comparison && eligibleSogBounds(comparison)
  if (primaryBounds === null && comparisonBounds === null) return []

  const firstBin = Math.min(
    primaryBounds?.min ?? Number.POSITIVE_INFINITY,
    comparisonBounds?.min ?? Number.POSITIVE_INFINITY,
  )
  const lastBin = Math.max(
    primaryBounds?.max ?? Number.NEGATIVE_INFINITY,
    comparisonBounds?.max ?? Number.NEGATIVE_INFINITY,
  )
  const bins: SogDistributionBin[] = []

  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    bins.push({
      start: bin * binSize,
      end: (bin + 1) * binSize,
      center: (bin + 0.5) * binSize,
      primaryPercentage: primary.sog.eligible && primary.sog.validTimeSeconds > 0
        ? (primary.sog.binTimeSeconds.get(bin) ?? 0) / primary.sog.validTimeSeconds * 100
        : null,
      comparisonPercentage: comparison?.sog.eligible && comparison.sog.validTimeSeconds > 0
        ? (comparison.sog.binTimeSeconds.get(bin) ?? 0) / comparison.sog.validTimeSeconds * 100
        : null,
    })
  }

  return bins
}

function buildSharedHeelBins(
  primary: ActivityVsDistribution,
  comparison: ActivityVsDistribution | null,
  binSize: number,
  domainMaximum: number,
) {
  const domainBins = domainMaximum / binSize
  const bins: HeelDistributionBin[] = []

  for (let bin = -domainBins; bin < domainBins; bin += 1) {
    bins.push({
      start: bin * binSize,
      end: (bin + 1) * binSize,
      center: (bin + 0.5) * binSize,
      primaryPercentage: primary.heel.eligible && primary.heel.validTimeSeconds > 0
        ? (primary.heel.binTimeSeconds.get(bin) ?? 0) / primary.heel.validTimeSeconds * 100
        : null,
      comparisonPercentage: comparison?.heel.eligible && comparison.heel.validTimeSeconds > 0
        ? (comparison.heel.binTimeSeconds.get(bin) ?? 0) / comparison.heel.validTimeSeconds * 100
        : null,
    })
  }

  return {
    bins,
    domainMaximum,
  }
}

export function calculateVsDistributions(
  primarySamples: TrackSample[],
  comparisonSamples: TrackSample[] | null,
  window: AnalysisWindowRange,
  config: VsCalculationConfig = VS_CONFIG,
): VsDistributions {
  validateWindow(window)
  validateCogBinSize(config.cogBinDeg)
  if (!Number.isFinite(config.sogBinKt) || config.sogBinKt <= 0) {
    throw new Error('SOG bin size must be positive')
  }
  if (!Number.isFinite(config.heelBinDeg) || config.heelBinDeg <= 0) {
    throw new Error('HEEL bin size must be positive')
  }
  if (
    !Number.isFinite(config.heelDomainDeg)
    || config.heelDomainDeg <= 0
    || !Number.isInteger(config.heelDomainDeg / config.heelBinDeg)
  ) {
    throw new Error('HEEL domain must be positive and align with the bin size')
  }

  const windowDurationMs = window.end - window.start
  const primary = finalizeActivity(
    accumulateActivity(primarySamples, window, config),
    windowDurationMs,
    config,
  )
  const comparison = comparisonSamples === null
    ? null
    : finalizeActivity(
        accumulateActivity(comparisonSamples, window, config),
        windowDurationMs,
        config,
      )
  const heel = buildSharedHeelBins(
    primary,
    comparison,
    config.heelBinDeg,
    config.heelDomainDeg,
  )

  return {
    primary,
    comparison,
    sogBins: buildSharedSogBins(primary, comparison, config.sogBinKt),
    heelBins: heel.bins,
    heelDomainMaximum: heel.domainMaximum,
  }
}
