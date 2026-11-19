import { WIND_CONTEXT_CONFIG } from '../config/windContext'
import type { TrackSample } from '../types/track'
import type { AnalysisWindowRange } from './analysisWindow'
import {
  maneuverCourseReferencesFromEvidence,
  prepareCourseEvidence,
  type ManeuverCourseReferences,
  type PreparedCourseRun,
} from './maneuverCourseChange'
import { maneuverSelectionKey, type DisplayManeuver, type ManeuverActivityRole } from './maneuverEvents'
import { classifyWindSector, signedTwaDegrees, type WindSector } from './windContext'
import type { TwdAtTime } from './windSegments'

type WindContextConfig = typeof WIND_CONTEXT_CONFIG

/**
 * Wind sector context of one maneuver (#211.1): the sectors of its contextual entry and exit
 * course references against the TWD at its center time. A presentation reading only — never a
 * tack/gybe classification, never persisted and never an input to detection or metrics.
 */
export type ManeuverWindSector =
  | { kind: 'single', sector: WindSector }
  | { kind: 'transition', entry: WindSector, exit: WindSector }

export type ManeuverSectorFilter = 'all' | WindSector | 'transition'

const SHORT_SECTOR_LABELS: Record<WindSector, string> = {
  upwind: 'Up',
  reaching: 'Reach',
  downwind: 'Down',
}

const FULL_SECTOR_LABELS: Record<WindSector, string> = {
  upwind: 'Upwind',
  reaching: 'Reaching',
  downwind: 'Downwind',
}

/**
 * Classifies the entry and exit course references with the existing wind-context thresholds.
 * Missing references or a missing/non-finite TWD yield null; no sector is invented.
 */
export function classifyManeuverWindSector(
  references: ManeuverCourseReferences | null,
  twdDegrees: number | null,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): ManeuverWindSector | null {
  if (references === null || twdDegrees === null || !Number.isFinite(twdDegrees)) return null
  const entryTwa = signedTwaDegrees(twdDegrees, references.entryDeg)
  const exitTwa = signedTwaDegrees(twdDegrees, references.exitDeg)
  if (entryTwa === null || exitTwa === null) return null
  const entry = classifyWindSector(entryTwa, config)
  const exit = classifyWindSector(exitTwa, config)
  return entry === exit ? { kind: 'single', sector: entry } : { kind: 'transition', entry, exit }
}

/** Compact table label: `Up`, `Reach`, `Down` or a transition such as `Up→Down`; `—` when absent. */
export function formatManeuverWindSector(sector: ManeuverWindSector | null | undefined) {
  if (sector === null || sector === undefined) return '—'
  return sector.kind === 'single'
    ? SHORT_SECTOR_LABELS[sector.sector]
    : `${SHORT_SECTOR_LABELS[sector.entry]}→${SHORT_SECTOR_LABELS[sector.exit]}`
}

/** Full label: `Upwind`, `Reaching`, `Downwind` or a transition such as `Upwind to Downwind`. */
export function formatManeuverWindSectorFull(sector: ManeuverWindSector | null | undefined) {
  if (sector === null || sector === undefined) return 'Unavailable'
  return sector.kind === 'single'
    ? FULL_SECTOR_LABELS[sector.sector]
    : `${FULL_SECTOR_LABELS[sector.entry]} to ${FULL_SECTOR_LABELS[sector.exit]}`
}

export function formatManeuverSectorFilterShort(filter: ManeuverSectorFilter) {
  if (filter === 'all') return 'All'
  if (filter === 'transition') return 'Transition'
  return SHORT_SECTOR_LABELS[filter]
}

export function formatManeuverSectorFilterFull(filter: ManeuverSectorFilter) {
  if (filter === 'all') return 'All'
  if (filter === 'transition') return 'Transition'
  return FULL_SECTOR_LABELS[filter]
}

/** All matches every maneuver; others need an available sector, so `—` maneuvers appear only under All. */
export function maneuverMatchesSectorFilter(
  sector: ManeuverWindSector | null | undefined,
  filter: ManeuverSectorFilter,
) {
  if (filter === 'all') return true
  if (sector === null || sector === undefined) return false
  if (filter === 'transition') return sector.kind === 'transition'
  return sector.kind === 'single' && sector.sector === filter
}

/**
 * Per-maneuver sector context keyed by `maneuverSelectionKey`. Each maneuver uses the course
 * evidence of its own Activity track inside the Analysis Window and the segment TWD reference
 * (nearest modelled direction or active Manual · Viewer value) at its center time. Without a
 * TWD reference the result is null (no column values and no filter).
 */
export function deriveManeuverWindSectors(
  events: readonly DisplayManeuver[],
  samples: Readonly<Record<ManeuverActivityRole, readonly TrackSample[]>>,
  analysisWindow: AnalysisWindowRange | null,
  twdAtTime: TwdAtTime | null,
  config: WindContextConfig = WIND_CONTEXT_CONFIG,
): Map<string, ManeuverWindSector> | null {
  if (twdAtTime === null) return null
  const sectors = new Map<string, ManeuverWindSector>()
  if (analysisWindow === null) return sectors
  const evidence: Partial<Record<ManeuverActivityRole, PreparedCourseRun[]>> = {}

  for (const event of events) {
    let runs = evidence[event.activityRole]
    if (runs === undefined) {
      runs = prepareCourseEvidence(samples[event.activityRole], analysisWindow)
      evidence[event.activityRole] = runs
    }
    const references = maneuverCourseReferencesFromEvidence(event.maneuver, runs, analysisWindow)
    const sector = classifyManeuverWindSector(references, twdAtTime(event.centerTimeMs), config)
    if (sector !== null) sectors.set(maneuverSelectionKey(event), sector)
  }
  return sectors
}
