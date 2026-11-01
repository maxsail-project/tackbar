// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/tackbarApi'
import type { PersonalActivity, PersonalBoat, PersonalTackBar } from '../types/personal'
import PersonalTackBarPage from './PersonalTackBarPage'

vi.mock('../api/tackbarApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/tackbarApi')>(),
  getPersonalTackBar: vi.fn(),
  getPersonalActivities: vi.fn(),
  getPersonalBoats: vi.fn(),
  getPersonalBoatClasses: vi.fn(),
  getPersonalDefaultBoat: vi.fn(),
  createPersonalBoat: vi.fn(),
  updatePersonalBoat: vi.fn(),
  updatePersonalDefaultBoat: vi.fn(),
  updatePersonalActivity: vi.fn(),
}))

const history: PersonalTackBar = {
  email: 'sailor@example.test', name: 'Sailor', session_count: 1, last_sailing_end: null,
  sessions: [{ sailing_start: '2026-09-05T13:49:00Z', sailing_end: '2026-09-05T17:21:00Z', sailor_count: 2, location_label: 'Mahón', location_country: 'Spain', weather: null, session_path: '/s/shared' }],
}
const owned: PersonalBoat = { id: 'owned-1', name: 'Mistral', sailing_class: 'Snipe', sail_number: '42' }
const other: PersonalBoat = { id: 'owned-2', name: 'Boreas', sailing_class: null, sail_number: null }
const activity: PersonalActivity = {
  id: 'activity-1', boat_id: 'legacy-1', boat: { id: 'legacy-1', name: 'Old boat', sailing_class: null, sail_number: null },
  device_name: '', device_label: null, source: 'gpx', original_filename: 'watch.gpx',
  start_time: '2026-09-05T13:49:00Z', end_time: '2026-09-05T17:21:00Z',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(api.getPersonalTackBar).mockResolvedValue(history)
  vi.mocked(api.getPersonalActivities).mockResolvedValue([activity])
  vi.mocked(api.getPersonalBoats).mockResolvedValue([owned, other])
  vi.mocked(api.getPersonalBoatClasses).mockResolvedValue(['Snipe', 'ILCA 7', '49er'])
  vi.mocked(api.getPersonalDefaultBoat).mockResolvedValue({ default_boat_id: null })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function mount() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/me/personal-token']}>
    <Routes><Route path="/me/:token" element={<PersonalTackBarPage />} /></Routes>
  </MemoryRouter>))
}

async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === text)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

async function choose(value: string) {
  const select = container.querySelector<HTMLSelectElement>('.personal-activity select')!
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}

async function typeLabel(value: string) {
  const input = container.querySelector<HTMLInputElement>('.personal-activity input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('My Activities', () => {
  it('renders origin and optional context, with only owned Boats as new choices', async () => {
    await mount()
    expect(container.textContent).toContain('My Sessions')
    expect(container.querySelector('a[href="/s/shared"]')).not.toBeNull()
    expect(container.textContent).toContain('My Activities')
    expect(container.querySelector('main.personal-page > h1#my-sessions-heading')).not.toBeNull()
    expect(container.querySelector('main.personal-page > section > h2#my-activities-heading')).not.toBeNull()
    expect(container.querySelector('main.personal-page > section > h2#my-boats-heading')).not.toBeNull()
    expect(container.querySelector('.personal-activity h3')).not.toBeNull()
    expect(container.textContent).toContain('Old boat')
    expect(container.textContent).toContain('Device: Not available')
    expect(container.textContent).toContain('Source: gpx · Original file: watch.gpx · Extracted Device: Not available')
    await click('Edit Activity')
    expect(container.querySelector('.personal-activity__edit')).toBeNull()
    expect(container.querySelector<HTMLButtonElement>('.personal-activity button[type="submit"]')?.classList.contains('personal-action--primary')).toBe(true)
    expect([...container.querySelectorAll<HTMLButtonElement>('.personal-activity__actions button')].find((button) => button.textContent === 'Cancel')?.classList.contains('personal-action--secondary')).toBe(true)
    const options = [...container.querySelectorAll<HTMLOptionElement>('.personal-activity option')].map((item) => [item.value, item.textContent])
    expect(options).toEqual([
      ['__keep__', 'Keep current Boat association'], ['', 'No Boat'],
      ['owned-1', 'Mistral · Snipe · 42'], ['owned-2', 'Boreas'],
    ])
    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('__keep__')
    expect(options.some(([value]) => value === 'legacy-1')).toBe(false)
    expect(container.querySelector<HTMLInputElement>('.personal-activity input')?.value).toBe('')
  })

  it('prefills an extracted Device and only writes an edited custom label', async () => {
    const vakaros = { ...activity, source: 'vakaros', device_name: 'Vakaros 1', original_filename: 'Vakaros 1.vkx' }
    vi.mocked(api.getPersonalActivities).mockResolvedValue([vakaros])
    vi.mocked(api.updatePersonalActivity).mockImplementation(async (_token, _id, patch) => ({ ...vakaros, ...patch }))
    await mount()
    await click('Edit Activity')
    expect(container.querySelector<HTMLInputElement>('.personal-activity input')?.value).toBe('Vakaros 1')
    await click('Save')
    expect(api.updatePersonalActivity).not.toHaveBeenCalled()
    await click('Edit Activity')
    await typeLabel('Bow Vakaros')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenCalledWith('personal-token', 'activity-1', { device_label: 'Bow Vakaros' }, expect.any(AbortSignal))
    expect(container.textContent).toContain('Device: Bow Vakaros')
    expect(container.textContent).toContain('Extracted Device: Vakaros 1')
  })

  it('clears a custom label back to extracted Device provenance', async () => {
    const vakaros = { ...activity, source: 'vakaros', device_name: 'Vakaros 1', device_label: 'Bow Vakaros' }
    vi.mocked(api.getPersonalActivities).mockResolvedValue([vakaros])
    vi.mocked(api.updatePersonalActivity).mockImplementation(async (_token, _id, patch) => ({ ...vakaros, ...patch }))
    await mount()
    await click('Edit Activity')
    expect(container.querySelector<HTMLInputElement>('.personal-activity input')?.value).toBe('Bow Vakaros')
    await typeLabel('')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenLastCalledWith('personal-token', 'activity-1', { device_label: null }, expect.any(AbortSignal))
    expect(container.textContent).toContain('Device: Vakaros 1')
    await click('Edit Activity')
    await typeLabel('Second label')
    await click('Save')
    await click('Edit Activity')
    await typeLabel('Vakaros 1')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenLastCalledWith('personal-token', 'activity-1', { device_label: null }, expect.any(AbortSignal))
    expect(container.textContent).toContain('Device: Vakaros 1')
  })

  it('does not write an override when an inherited Device is cleared, including with a Boat edit', async () => {
    const vakaros = { ...activity, source: 'vakaros', device_name: 'Vakaros 1' }
    vi.mocked(api.getPersonalActivities).mockResolvedValue([vakaros])
    vi.mocked(api.updatePersonalActivity).mockImplementation(async (_token, _id, patch) => ({ ...vakaros, ...patch }))
    await mount()
    await click('Edit Activity')
    await typeLabel('')
    await click('Save')
    expect(api.updatePersonalActivity).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Device: Vakaros 1')
    await click('Edit Activity')
    await choose('owned-1')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenCalledWith('personal-token', 'activity-1', { boat_id: 'owned-1' }, expect.any(AbortSignal))
  })

  it('preserves a legacy Boat on label-only Save, supports Cancel and explicit clearing', async () => {
    vi.mocked(api.updatePersonalActivity).mockImplementation(async (_token, _id, patch) => ({ ...activity, ...patch }))
    await mount()
    await click('Edit Activity')
    await typeLabel('Watch on bow')
    await click('Cancel')
    expect(api.updatePersonalActivity).not.toHaveBeenCalled()
    await click('Edit Activity')
    await typeLabel('Watch on bow')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenCalledWith('personal-token', 'activity-1', { device_label: 'Watch on bow' }, expect.any(AbortSignal))
    expect(container.textContent).toContain('Activity saved.')
    await click('Edit Activity')
    await choose('')
    await typeLabel('')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenLastCalledWith('personal-token', 'activity-1', { boat_id: null, device_label: null }, expect.any(AbortSignal))
    await click('Edit Activity')
    await choose('owned-2')
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenLastCalledWith('personal-token', 'activity-1', { boat_id: 'owned-2' }, expect.any(AbortSignal))
  })

  it('handles empty lists and a failed read with Retry', async () => {
    vi.mocked(api.getPersonalActivities).mockRejectedValueOnce(new Error('private failure')).mockResolvedValueOnce([])
    vi.mocked(api.getPersonalBoats).mockResolvedValue([])
    await mount()
    expect(container.textContent).toContain('Could not load My Activities.')
    expect(container.textContent).not.toContain('private failure')
    await click('Retry')
    expect(container.textContent).toContain('No Activities recorded yet.')
    expect(container.textContent).toContain('My Sessions')
  })

  it('shows an Activity with no Boat and an empty owned catalogue', async () => {
    vi.mocked(api.getPersonalActivities).mockResolvedValue([{ ...activity, boat_id: null, boat: null }])
    vi.mocked(api.getPersonalBoats).mockResolvedValue([])
    await mount()
    expect(container.textContent).toContain('Boat: No Boat')
    await click('Edit Activity')
    expect([...container.querySelectorAll('.personal-activity option')].map((option) => option.textContent)).toEqual(['No Boat'])
    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('')
  })

  it('does not display foreign Boat metadata from an unavailable reference', async () => {
    vi.mocked(api.getPersonalActivities).mockResolvedValue([{ ...activity, boat_id: 'foreign-1', boat: null }])
    await mount()
    expect(container.textContent).toContain('Unavailable Boat association')
    await click('Edit Activity')
    expect(container.querySelector<HTMLSelectElement>('select')?.value).toBe('__keep__')
    expect(container.textContent).not.toContain('foreign-1')
  })

  it('cancels an outstanding Activity read when the page closes', async () => {
    vi.mocked(api.getPersonalActivities).mockImplementation(() => new Promise(() => {}))
    await mount()
    expect(container.textContent).toContain('Loading My Activities…')
    const signal = vi.mocked(api.getPersonalActivities).mock.calls[0][1]!
    expect(signal.aborted).toBe(false)
    await act(async () => root.unmount())
    expect(signal.aborted).toBe(true)
  })

  it('blocks duplicate writes, allows retry after failure and clears content on capability denial', async () => {
    let rejectWrite!: (error: Error) => void
    vi.mocked(api.updatePersonalActivity).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject }))
      .mockRejectedValueOnce(new api.PersonalTackBarNotFoundError())
    await mount()
    await click('Edit Activity')
    await typeLabel('Bow watch')
    await click('Save')
    expect(container.textContent).toContain('Saving Activity…')
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    expect([...container.querySelectorAll<HTMLButtonElement>('.personal-activity__actions button')].find((button) => button.textContent === 'Cancel')?.disabled).toBe(true)
    await click('Save')
    expect(api.updatePersonalActivity).toHaveBeenCalledTimes(1)
    await act(async () => rejectWrite(new Error('secret server detail')))
    expect(container.textContent).toContain('Could not save Activity. Please try again.')
    expect(container.textContent).not.toContain('secret server detail')
    expect(container.querySelector<HTMLInputElement>('.personal-activity input')?.value).toBe('Bow watch')
    await click('Save')
    expect(container.textContent).toContain('This personal link is unavailable.')
    expect(container.textContent).not.toContain('sailor@example.test')
    expect(container.textContent).not.toContain('My Activities')
  })

  it('adds Boat choices and refreshes Activity context without losing an unsaved Activity edit', async () => {
    vi.mocked(api.getPersonalActivities).mockResolvedValue([{ ...activity, boat_id: owned.id, boat: owned }])
    vi.mocked(api.createPersonalBoat).mockResolvedValue({ id: 'owned-3', name: 'New boat', sailing_class: null, sail_number: null })
    vi.mocked(api.updatePersonalBoat).mockResolvedValue({ ...owned, name: 'Renamed' })
    await mount()
    await click('Edit Activity')
    await typeLabel('Unsaved label')
    await click('Add Boat')
    const name = container.querySelector<HTMLInputElement>('.personal-boats__form input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'New boat')
      name.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Save Boat')
    expect([...container.querySelectorAll<HTMLOptionElement>('.personal-activity option')].map((option) => option.value)).toContain('owned-3')
    expect(container.querySelector<HTMLInputElement>('.personal-activity input')?.value).toBe('Unsaved label')
    await click('Edit Boat')
    const editName = container.querySelector<HTMLInputElement>('.personal-boats__form input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(editName, 'Renamed')
      editName.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Save Boat')
    expect(container.querySelector('.personal-activity')?.textContent).toContain('Boat: Renamed · Snipe · 42')
    expect(container.querySelector<HTMLInputElement>('.personal-activity input')?.value).toBe('Unsaved label')
    expect(api.updatePersonalActivity).not.toHaveBeenCalled()
  })

  it('clears the personal page immediately on Boat capability denial while another Boat read is pending', async () => {
    vi.mocked(api.getPersonalBoatClasses).mockRejectedValue(new api.PersonalTackBarNotFoundError())
    vi.mocked(api.getPersonalDefaultBoat).mockImplementation(() => new Promise(() => {}))
    await mount()
    expect(container.textContent).toContain('This personal link is unavailable.')
    expect(container.textContent).not.toContain('sailor@example.test')
    expect(container.textContent).not.toContain('My Activities')
    expect(container.textContent).not.toContain('My Boats')
  })
})
