// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PreparedSogPopulation } from '../utils/typicalSogProfile'
import ManeuverEventTable from './ManeuverEventTable'
import ManeuverProfiles from './ManeuverProfiles'

function population(): PreparedSogPopulation {
  return {
    detectedCount: 3,
    windowEligibleCount: 3,
    missingCourseCount: 0,
    maneuvers: Array.from({ length: 3 }, (_, index) => ({
      courseChangeDeg: 60,
      nominalCoverage: 1,
      grid: Array.from({ length: 51 }, () => index + 3),
    })),
  }
}

let container: HTMLDivElement
let root: Root
let originalHidePopover: PropertyDescriptor | undefined

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  originalHidePopover = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidePopover')
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: () => undefined })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (originalHidePopover) Object.defineProperty(HTMLElement.prototype, 'hidePopover', originalHidePopover)
  else Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover')
})

async function mount(primary: PreparedSogPopulation | null, comparison?: PreparedSogPopulation | null) {
  await act(async () => root.render(<>
    <ManeuverEventTable events={[]} primaryStatus="available" onSelect={() => undefined} />
    <ManeuverProfiles primary={primary} comparison={comparison} />
  </>))
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click())
}

describe('separate Maneuver Profiles disclosure', () => {
  it('starts expanded with SOG curves while Maneuver Analysis remains collapsed', async () => {
    await mount(population(), population())
    const analysis = container.querySelector<HTMLElement>('.maneuver-section')!
    const profiles = container.querySelector<HTMLElement>('.maneuver-profiles-section')!
    expect(analysis.querySelector<HTMLButtonElement>('.maneuver-section__collapse')?.getAttribute('aria-expanded')).toBe('false')
    expect(profiles.querySelector<HTMLButtonElement>('.maneuver-section__collapse')?.getAttribute('aria-expanded')).toBe('true')
    expect(profiles.querySelector('[data-profile-series="primary-raw"]')).not.toBeNull()
    expect(profiles.querySelector('[data-profile-series="comparison-smoothed"]')).not.toBeNull()
    expect(profiles.textContent).toContain('SOG Maneuver Insights')
    expect(analysis.querySelector('.maneuver-profile')).toBeNull()
  })

  it('retains signal and angular controls through independent analysis and profile toggles', async () => {
    await mount(population())
    const analysis = container.querySelector<HTMLElement>('.maneuver-section')!
    const profiles = container.querySelector<HTMLElement>('.maneuver-profiles-section')!
    const analysisToggle = analysis.querySelector<HTMLButtonElement>('.maneuver-section__collapse')!
    const profilesToggle = profiles.querySelector<HTMLButtonElement>('.maneuver-section__collapse')!

    await click(analysisToggle)
    expect(analysisToggle.getAttribute('aria-expanded')).toBe('true')
    expect(profilesToggle.getAttribute('aria-expanded')).toBe('true')
    const cog = Array.from(profiles.querySelectorAll<HTMLButtonElement>('[aria-label="Maneuver profile signal"] button'))
      .find((button) => button.textContent === 'COG')!
    await click(cog)
    expect(cog.getAttribute('aria-pressed')).toBe('true')
    expect(profiles.textContent).toContain('COG Maneuver Insights')

    const minimum = profiles.querySelector<HTMLElement>('[role="slider"][aria-label="minimum course change"]')!
    await act(async () => minimum.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(minimum.getAttribute('aria-valuenow')).toBe('45')
    await click(analysisToggle)
    expect(analysisToggle.getAttribute('aria-expanded')).toBe('false')
    expect(cog.getAttribute('aria-pressed')).toBe('true')
    await click(profilesToggle)
    expect(profilesToggle.getAttribute('aria-expanded')).toBe('false')
    await click(profilesToggle)
    expect(profilesToggle.getAttribute('aria-expanded')).toBe('true')
    expect(cog.getAttribute('aria-pressed')).toBe('true')
    expect(minimum.getAttribute('aria-valuenow')).toBe('45')
  })

  it('preserves one-sided and unavailable profile states', async () => {
    await mount(null)
    const profiles = container.querySelector<HTMLElement>('.maneuver-profiles-section')!
    expect(profiles.textContent).toContain('P profile data unavailable.')
    expect(profiles.textContent).not.toContain('C profile data unavailable.')
    await act(async () => root.render(<ManeuverProfiles primary={population()} comparison={null} />))
    expect(container.textContent).toContain('C profile data unavailable.')
  })
})
