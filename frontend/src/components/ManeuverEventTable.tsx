import { useId, useMemo, useRef, useState } from 'react'
import { ACTIVITY_COLORS } from '../config/activityColors'
import type { ActivityManeuverAnalytics } from '../types/maneuver'
import type { DisplayManeuver, ManeuverActivityRole } from '../utils/maneuverEvents'
import {
  formatHeadingChange,
  formatKnots,
  formatMetres,
  formatSeconds,
  maneuverSelectionKey,
} from '../utils/maneuverEvents'
import {
  formatManeuverSectorFilterFull,
  formatManeuverSectorFilterShort,
  formatManeuverWindSector,
  formatManeuverWindSectorFull,
  maneuverMatchesSectorFilter,
  type ManeuverSectorFilter,
  type ManeuverWindSector,
} from '../utils/maneuverWindSector'
import {
  deriveManeuverLossBands,
  formatManeuverLossBand,
  maneuverLossTimeSeconds,
  type ManeuverLossBand,
} from '../utils/maneuverLossBands'
import { formatGpsTime } from '../utils/replay'

export type ManeuverPresentationStatus =
  | 'loading'
  | 'available'
  | 'unavailable'
  | 'error'

interface ManeuverEventTableProps {
  events: DisplayManeuver[]
  primaryStatus: ManeuverPresentationStatus
  comparisonStatus?: ManeuverPresentationStatus
  primaryDetectorMode?: ActivityManeuverAnalytics['detector_mode']
  comparisonDetectorMode?: ActivityManeuverAnalytics['detector_mode']
  selectedManeuverKey?: string | null
  onSelect: (event: DisplayManeuver) => void
  /**
   * Per-maneuver wind sector context keyed by `maneuverSelectionKey` (#211.1). `null` (default)
   * means no TWD reference: the Sector column reads `—` and the sector filter is absent.
   */
  windSectors?: ReadonlyMap<string, ManeuverWindSector> | null
  /** Changing this (Activity selection or Analysis Window change) resets the sector filter to All. */
  sectorFilterResetKey?: string
}

const SECTOR_FILTERS: ManeuverSectorFilter[] = ['all', 'upwind', 'reaching', 'downwind', 'transition']

/** Neutral shape marker for High/Low loss (filled/hollow); Typical has none. Decorative only. */
function LossBandMarker({ band }: { band: ManeuverLossBand }) {
  if (band === 'typical') return null
  return <span className={`maneuver-loss-band__marker maneuver-loss-band__marker--${band}`} aria-hidden="true" />
}

/**
 * Ephemeral single-select filter tied to the reset key it was chosen for; a new key falls back
 * to All without an effect or extra render.
 */
function useResettableFilter<F extends string>(resetKey: string) {
  const [state, setState] = useState<{ key: string, value: F | 'all' }>({ key: resetKey, value: 'all' })
  const active: F | 'all' = state.key === resetKey ? state.value : 'all'
  return [active, (value: F | 'all') => setState({ key: resetKey, value })] as const
}

function countByFilter<F extends string>(
  filters: readonly F[],
  events: readonly DisplayManeuver[],
  matches: (event: DisplayManeuver, filter: F) => boolean,
) {
  return new Map<F, number>(filters.map((filter) => [
    filter,
    events.filter((event) => matches(event, filter)).length,
  ]))
}

/**
 * Maneuver Analysis filter group (wind sector #211.1): single-select options with counts among
 * listed maneuvers, full accessible names, and options without maneuvers disabled unless
 * selected. Reuses the Wind Segments filter styling.
 */
function ManeuverFilterGroup<F extends string>({
  label,
  filters,
  active,
  counts,
  dataAttribute,
  shortLabel,
  fullLabel,
  onChange,
}: {
  label: string
  filters: readonly F[]
  active: F
  counts: ReadonlyMap<F, number>
  dataAttribute: `data-${string}`
  shortLabel: (filter: F) => string
  fullLabel: (filter: F) => string
  onChange: (filter: F) => void
}) {
  return (
    <div className="wind-segments__filter" role="group" aria-label={label}>
      {filters.map((filter) => {
        const count = counts.get(filter) ?? 0
        return (
          <button
            key={filter}
            type="button"
            className="wind-segments__filter-option"
            {...{ [dataAttribute]: filter }}
            aria-pressed={active === filter}
            aria-label={`${fullLabel(filter)}, ${formatManeuverCount(count)}`}
            disabled={count === 0 && active !== filter}
            onClick={() => onChange(filter)}
          >
            {shortLabel(filter)} {count}
          </button>
        )
      })}
    </div>
  )
}

export function formatManeuverCount(count: number) {
  return `${count} ${count === 1 ? 'maneuver' : 'maneuvers'}`
}

export type ManeuverSortDirection = 'asc' | 'desc'
export type ManeuverSortColumn = 'time' | 'loss'

/** Ephemeral table sort (#211.2 D12): the active column plus each column's own direction. */
export interface ManeuverSortState {
  column: ManeuverSortColumn
  timeDirection: ManeuverSortDirection
  lossDirection: ManeuverSortDirection
}

export const INITIAL_MANEUVER_SORT: ManeuverSortState = { column: 'time', timeDirection: 'asc', lossDirection: 'desc' }

function compareManeuverTime(first: DisplayManeuver, second: DisplayManeuver, direction: ManeuverSortDirection) {
  const timeDifference = first.centerTimeMs - second.centerTimeMs
  if (timeDifference !== 0) return direction === 'asc' ? timeDifference : -timeDifference
  if (first.activityRole !== second.activityRole) {
    return first.activityRole === 'primary' ? -1 : 1
  }
  const startDifference = first.maneuver.start_time.localeCompare(
    second.maneuver.start_time,
  )
  if (startDifference !== 0) return startDifference
  return first.maneuver.end_time.localeCompare(second.maneuver.end_time)
}

export function sortManeuverEvents(
  events: DisplayManeuver[],
  direction: ManeuverSortDirection,
) {
  return [...events].sort((first, second) => compareManeuverTime(first, second, direction))
}

/**
 * Sorts P and C together by unrounded equivalent Loss time. Maneuvers without a finite Loss time
 * are always last; ties (and the unavailable group) follow ascending chronological order.
 */
export function sortManeuverEventsByLossTime(
  events: DisplayManeuver[],
  direction: ManeuverSortDirection,
) {
  return [...events].sort((first, second) => {
    const firstLoss = maneuverLossTimeSeconds(first)
    const secondLoss = maneuverLossTimeSeconds(second)
    if (firstLoss === null || secondLoss === null) {
      if (firstLoss !== secondLoss) return firstLoss === null ? 1 : -1
    } else if (firstLoss !== secondLoss) {
      return direction === 'asc' ? firstLoss - secondLoss : secondLoss - firstLoss
    }
    return compareManeuverTime(first, second, 'asc')
  })
}

/**
 * Activating the active column reverses its direction. Activating Time from Loss returns to
 * chronological order in Time's current direction; activating Loss from Time starts with the
 * largest Loss time first.
 */
export function activatedManeuverSort(state: ManeuverSortState, column: ManeuverSortColumn): ManeuverSortState {
  if (column === 'time') {
    return state.column === 'time'
      ? { ...state, timeDirection: toggledSortDirection(state.timeDirection) }
      : { ...state, column: 'time' }
  }
  return state.column === 'loss'
    ? { ...state, lossDirection: toggledSortDirection(state.lossDirection) }
    : { ...state, column: 'loss', lossDirection: 'desc' }
}

export function toggledExpandedState(expanded: boolean) {
  return !expanded
}

export function toggledSortDirection(direction: ManeuverSortDirection): ManeuverSortDirection {
  return direction === 'asc' ? 'desc' : 'asc'
}

/**
 * Sortable header: a muted ⇅ while inactive, a solid ▲/▼ in the accent colour while active
 * (decorative), and `aria-sort` only on the active column.
 */
function SortableHeader({
  label,
  active,
  direction,
  actionLabel,
  onActivate,
}: {
  label: string
  active: boolean
  direction: ManeuverSortDirection
  actionLabel: string
  onActivate: () => void
}) {
  return (
    <th
      scope="col"
      className="maneuver-event-table__sortable"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <button
        type="button"
        className="maneuver-event-table__sort"
        aria-label={actionLabel}
        onClick={onActivate}
      >
        {label}
        <span
          className={`maneuver-event-table__sort-indicator${active ? ' maneuver-event-table__sort-indicator--active' : ''}`}
          aria-hidden="true"
        >
          {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  )
}

/** Marker legend below the table (#211.2 D10); markers are decorative, the text is read. */
function LossBandLegend() {
  return (
    <p className="maneuver-loss-band-legend" data-maneuver-loss-band-legend>
      <span className="maneuver-loss-band-legend__item"><LossBandMarker band="high" />{formatManeuverLossBand('high')}</span>
      <span className="maneuver-event-table__sr-only">, </span>
      <span className="maneuver-loss-band-legend__item"><LossBandMarker band="low" />{formatManeuverLossBand('low')}</span>
      <span> · within each Activity</span>
    </p>
  )
}

function roleLabel(role: ManeuverActivityRole) {
  return role === 'primary' ? 'P' : 'C'
}

export function ManeuverEventRow({
  event,
  selected,
  onSelect,
  windSector = null,
  lossBand = null,
}: {
  event: DisplayManeuver
  selected: boolean
  onSelect: (event: DisplayManeuver) => void
  windSector?: ManeuverWindSector | null
  /** Descriptive loss band (#211.2) shown on the Loss (s) cell; null means unbanded. */
  lossBand?: ManeuverLossBand | null
}) {
  const label = roleLabel(event.activityRole)

  return (
    <tr
      className={`maneuver-event-table__row${selected
        ? ` maneuver-event-table__row--selected maneuver-event-table__row--${event.activityRole}`
        : ''}`}
      aria-selected={selected}
      onClick={() => onSelect(event)}
    >
      <td>
        <button
          type="button"
          className="maneuver-event-table__button"
          aria-label={`Move replay to ${formatGpsTime(event.centerTimeMs)} UTC, Activity ${label}`}
        >
          {formatGpsTime(event.centerTimeMs)}
        </button>
      </td>
      <td
        className="maneuver-event-table__activity"
        style={{ color: ACTIVITY_COLORS[event.activityRole] }}
      >
        {label}
      </td>
      <td
        className="maneuver-event-table__sector"
        data-maneuver-sector={windSector === null ? 'unavailable' : windSector.kind}
        title={windSector === null ? undefined : formatManeuverWindSectorFull(windSector)}
      >
        {formatManeuverWindSector(windSector)}
      </td>
      <td>{formatMetres(event.maneuver.speed_loss_distance_m)}</td>
      {lossBand === null ? (
        <td>{formatSeconds(event.maneuver.speed_loss_time_s)}</td>
      ) : (
        <td
          className={`maneuver-loss-band maneuver-loss-band--${lossBand}`}
          data-maneuver-loss-band={lossBand}
          title={formatManeuverLossBand(lossBand)}
        >
          <LossBandMarker band={lossBand} />
          {formatSeconds(event.maneuver.speed_loss_time_s)}
          <span className="maneuver-event-table__sr-only">{` · ${formatManeuverLossBand(lossBand)}`}</span>
        </td>
      )}
      <td>{formatSeconds(event.maneuver.recovery_time_s)}</td>
      <td>{formatKnots(event.maneuver.sog_entry_kn)}</td>
      <td>{formatKnots(event.maneuver.sog_min_kn)}</td>
      <td>{formatKnots(event.maneuver.sog_exit_kn)}</td>
      <td>{event.maneuver.heading_change_deg !== null
        ? `ΔHDG ${formatHeadingChange(event.maneuver.heading_change_deg)}`
        : event.maneuver.course_change_deg !== null
          ? `ΔCOG ${formatHeadingChange(event.maneuver.course_change_deg)}`
          : '—'}</td>
      <td>{formatSeconds(event.maneuver.duration_s)}</td>
    </tr>
  )
}

export default function ManeuverEventTable({
  events,
  primaryStatus,
  comparisonStatus,
  primaryDetectorMode,
  comparisonDetectorMode,
  selectedManeuverKey = null,
  onSelect,
  windSectors = null,
  sectorFilterResetKey = '',
}: ManeuverEventTableProps) {
  const [expanded, setExpanded] = useState(false)
  const [helpExpanded, setHelpExpanded] = useState(false)
  const [sort, setSort] = useState<ManeuverSortState>(INITIAL_MANEUVER_SORT)
  const contentId = useId()
  const helpId = useId()
  const helpRef = useRef<HTMLDivElement>(null)
  const evidence = [
    { role: 'primary' as const, status: primaryStatus, mode: primaryDetectorMode },
    { role: 'comparison' as const, status: comparisonStatus, mode: comparisonDetectorMode },
  ].filter(({ status, mode }) => status === 'available' && (mode === 'HIGH' || mode === 'LOW'))
  const statuses = [primaryStatus, comparisonStatus].filter(
    (status): status is ManeuverPresentationStatus => status !== undefined,
  )
  const allSelectedAnalyticsAvailable = statuses.every(
    (status) => status === 'available',
  )
  const sortedEvents = useMemo(
    () => sort.column === 'time'
      ? sortManeuverEvents(events, sort.timeDirection)
      : sortManeuverEventsByLossTime(events, sort.lossDirection),
    [events, sort],
  )
  const activateSort = (column: ManeuverSortColumn) => setSort((current) => activatedManeuverSort(current, column))
  const timeSortAction = sort.column === 'time' ? toggledSortDirection(sort.timeDirection) : sort.timeDirection
  const lossSortAction = sort.column === 'loss' ? toggledSortDirection(sort.lossDirection) : 'desc'
  // Ephemeral sector filter tied to the reset key it was chosen for; a new key falls back to All.
  const [chosenSectorFilter, setSectorFilter] = useResettableFilter<ManeuverSectorFilter>(sectorFilterResetKey)
  const activeSectorFilter: ManeuverSectorFilter = windSectors !== null ? chosenSectorFilter : 'all'
  const sectorOf = (event: DisplayManeuver) => windSectors?.get(maneuverSelectionKey(event)) ?? null
  const sectorCounts = countByFilter(SECTOR_FILTERS, events, (event, filter) => maneuverMatchesSectorFilter(sectorOf(event), filter))
  // The filter narrows the table only; it never changes the Analysis Window or other sections.
  const visibleEvents = activeSectorFilter === 'all'
    ? sortedEvents
    : sortedEvents.filter((event) => maneuverMatchesSectorFilter(sectorOf(event), activeSectorFilter))
  const showSectorFilter = windSectors !== null && (events.length > 0 || activeSectorFilter !== 'all')
  // #211.2: bands are recomputed per Activity over the currently listed maneuvers (after the
  // sector filter).
  const sectorListedEvents = useMemo(
    () => activeSectorFilter === 'all'
      ? events
      : events.filter((event) => maneuverMatchesSectorFilter(
        windSectors?.get(maneuverSelectionKey(event)) ?? null,
        activeSectorFilter,
      )),
    [events, windSectors, activeSectorFilter],
  )
  const lossBands = useMemo(() => deriveManeuverLossBands(sectorListedEvents), [sectorListedEvents])
  const bandOf = (event: DisplayManeuver) => lossBands.get(maneuverSelectionKey(event)) ?? null

  return (
    <section className="content-section maneuver-section" aria-labelledby="maneuver-title">
      <div className="maneuver-section__header">
        <p className="section-kicker" id="maneuver-title">Maneuver Analysis</p>
        <button
          type="button"
          className="maneuver-section__collapse"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => {
            helpRef.current?.hidePopover()
            setExpanded((current) => toggledExpandedState(current))
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div id={contentId} hidden={!expanded}>
          {evidence.length > 0 && <>
            <div className="maneuver-evidence">
              {evidence.map(({ role, mode }) => (
                <span key={role} style={{ color: ACTIVITY_COLORS[role] }}>
                  {roleLabel(role)} · {mode} evidence
                </span>
              ))}
              <button
                type="button"
                className="maneuver-evidence__info"
                aria-label="About maneuver evidence"
                aria-expanded={helpExpanded}
                aria-controls={helpId}
                popoverTarget={helpId}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v6" />
                  <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
            <div id={helpId} ref={helpRef} className="maneuver-evidence__help" popover="auto"
              role="note" aria-labelledby={`${helpId}-title`}
              onToggle={(event) => setHelpExpanded(event.newState === 'open')}
            >
              <h3 id={`${helpId}-title`}>Maneuver detection evidence</h3>
              <p><strong>HIGH evidence:</strong> Detection based on heading (HDG), with supporting signals such as heel (HEEL), course (COG), and speed (SOG) when available.</p>
              <p><strong>LOW evidence:</strong> Detection based on course (COG) and speed (SOG).</p>
              <p className="maneuver-evidence__secondary">HIGH uses richer telemetry, but neither level guarantees detection accuracy or indicates overall track quality.</p>
              <p className="maneuver-evidence__secondary">ΔHDG = heading change · ΔCOG = course change</p>
            </div>
          </>}
          <div className="maneuver-statuses" aria-live="polite">
            {primaryStatus === 'loading' && <p>Loading maneuver analytics for P…</p>}
            {(primaryStatus === 'unavailable' || primaryStatus === 'error') && (
              <p>Maneuver analytics unavailable for P.</p>
            )}
            {comparisonStatus === 'loading' && <p>Loading maneuver analytics for C…</p>}
            {(comparisonStatus === 'unavailable' || comparisonStatus === 'error') && (
              <p>Maneuver analytics unavailable for C.</p>
            )}
          </div>

          {showSectorFilter && (
            <ManeuverFilterGroup
              label="Filter maneuvers by wind sector"
              filters={SECTOR_FILTERS}
              active={activeSectorFilter}
              counts={sectorCounts}
              dataAttribute="data-maneuver-sector-filter"
              shortLabel={formatManeuverSectorFilterShort}
              fullLabel={formatManeuverSectorFilterFull}
              onChange={setSectorFilter}
            />
          )}

          {activeSectorFilter !== 'all' && visibleEvents.length === 0 ? (
            <p className="maneuver-empty" data-maneuver-sector-empty>
              {`No ${formatManeuverSectorFilterFull(activeSectorFilter)} maneuvers in this window`}
            </p>
          ) : events.length > 0 ? (
            <>
            <div className="maneuver-event-table-wrap">
              <table className="maneuver-event-table" aria-label="Detected maneuvers">
                <colgroup>
                  <col className="maneuver-event-table__time-column" />
                  <col className="maneuver-event-table__activity-column" />
                  <col className="maneuver-event-table__sector-column" />
                  <col className="maneuver-event-table__loss-column" span={2} />
                  <col className="maneuver-event-table__recovery-column" />
                  <col className="maneuver-event-table__sog-column" span={3} />
                  <col className="maneuver-event-table__heading-column" />
                  <col className="maneuver-event-table__duration-column" />
                </colgroup>
                <thead>
                  <tr>
                    <SortableHeader
                      label="Time"
                      active={sort.column === 'time'}
                      direction={sort.timeDirection}
                      actionLabel={`Sort maneuvers by time ${timeSortAction === 'asc' ? 'ascending' : 'descending'}`}
                      onActivate={() => activateSort('time')}
                    />
                    <th scope="col">Act</th>
                    <th scope="col">Sector</th>
                    <th scope="col">Loss (m)</th>
                    <SortableHeader
                      label="Loss (s)"
                      active={sort.column === 'loss'}
                      direction={sort.lossDirection}
                      actionLabel={`Sort maneuvers by Loss time, ${lossSortAction === 'desc' ? 'largest' : 'smallest'} first`}
                      onActivate={() => activateSort('loss')}
                    />
                    <th scope="col">Rec (s)</th>
                    <th scope="col">SOG in</th>
                    <th scope="col">SOG min</th>
                    <th scope="col">SOG out</th>
                    <th scope="col">Δ (°)</th>
                    <th scope="col">Dur (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((event) => (
                    <ManeuverEventRow
                      key={`${event.activityRole}:${event.maneuver.start_time}:${event.maneuver.center_time}:${event.maneuver.end_time}`}
                      event={event}
                      selected={maneuverSelectionKey(event) === selectedManeuverKey}
                      onSelect={onSelect}
                      windSector={sectorOf(event)}
                      lossBand={bandOf(event)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {lossBands.size > 0 && <LossBandLegend />}
            </>
          ) : allSelectedAnalyticsAvailable ? (
            <p className="maneuver-empty">No maneuvers detected in this Analysis Window.</p>
          ) : null}
      </div>
    </section>
  )
}
