import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, vi } from 'vitest'
import type { DisplayManeuver } from '../utils/maneuverEvents'
import type { ManeuverWindSector } from '../utils/maneuverWindSector'
import ManeuverEventTable from './ManeuverEventTable'

/** Shared jsdom harness for ManeuverEventTable filter tests; not used by production code. */
export interface ManeuverEventTableRenderProps {
  events?: DisplayManeuver[]
  windSectors?: ReadonlyMap<string, ManeuverWindSector> | null
  resetKey?: string
  selectedKey?: string | null
  onSelect?: (event: DisplayManeuver) => void
}

/**
 * Registers per-test mount/unmount hooks in the calling `describe` and returns helpers that
 * render the table (P HIGH, C LOW, both available) with the given defaults.
 */
export function setupManeuverEventTableHarness(defaults: {
  events: DisplayManeuver[]
  windSectors: ReadonlyMap<string, ManeuverWindSector>
}) {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  const rows = () => [...container.querySelectorAll<HTMLTableRowElement>('.maneuver-event-table tbody tr')]

  return {
    get container() {
      return container
    },
    render: (props: ManeuverEventTableRenderProps = {}) => act(async () => root.render(<ManeuverEventTable
      events={props.events ?? defaults.events}
      primaryStatus="available"
      comparisonStatus="available"
      primaryDetectorMode="HIGH"
      comparisonDetectorMode="LOW"
      selectedManeuverKey={props.selectedKey ?? null}
      onSelect={props.onSelect ?? vi.fn()}
      windSectors={props.windSectors === undefined ? defaults.windSectors : props.windSectors}
      sectorFilterResetKey={props.resetKey ?? 'k1'}
    />)),
    rows,
    rowTimes: () => rows().map((row) => row.querySelector('td:nth-child(2)')!.textContent),
    click: (button: HTMLButtonElement) => act(async () => button.click()),
  }
}
