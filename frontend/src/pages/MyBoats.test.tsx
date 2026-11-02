// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/tackbarApi'
import type { PersonalBoat } from '../types/personal'
import MyBoats from './MyBoats'

vi.mock('../api/tackbarApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/tackbarApi')>(),
  getPersonalBoats: vi.fn(),
  getPersonalBoatClasses: vi.fn(),
  getPersonalDefaultBoat: vi.fn(),
  createPersonalBoat: vi.fn(),
  updatePersonalBoat: vi.fn(),
  updatePersonalDefaultBoat: vi.fn(),
}))

const owned: PersonalBoat = { id: 'owned-1', name: 'Mistral', sailing_class: 'Snipe', sail_number: '42' }
const ilca: PersonalBoat = { id: 'owned-2', name: null, sailing_class: 'ILCA 7', sail_number: null }
let container: HTMLDivElement
let root: Root
let onUnavailable = vi.fn<() => void>()
let onBoatSaved = vi.fn<(boat: PersonalBoat) => void>()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  onUnavailable = vi.fn()
  onBoatSaved = vi.fn()
  vi.mocked(api.getPersonalBoats).mockResolvedValue([owned, ilca])
  vi.mocked(api.getPersonalBoatClasses).mockResolvedValue(['49er', 'ILCA 7', 'Snipe'])
  vi.mocked(api.getPersonalDefaultBoat).mockResolvedValue({ default_boat_id: null })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function mount() {
  await act(async () => root.render(<MyBoats token="personal/token" onUnavailable={onUnavailable} onBoatSaved={onBoatSaved} expanded onToggle={() => {}} />))
}

async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === text)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

async function input(field: string, value: string) {
  const element = [...container.querySelectorAll<HTMLInputElement>('.personal-boats__form input')]
    .find((item) => item.closest('label')?.textContent === field)!
  expect(element).toBeDefined()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return element
}

async function chooseDefault(value: string) {
  const select = container.querySelector<HTMLSelectElement>('.personal-boats__default select')!
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}

describe('My Boats', () => {
  it('lists owned Boats, validates at least one field, creates and keeps default empty', async () => {
    vi.mocked(api.createPersonalBoat).mockResolvedValue({ id: 'new-1', name: null, sailing_class: 'Snipe', sail_number: null })
    await mount()
    expect(container.textContent).toContain('Mistral · Snipe · 42')
    expect(container.textContent).toContain('Current: No default Boat')
    expect(container.querySelector<HTMLButtonElement>('.personal-boats__list .personal-action--edit')?.getAttribute('aria-label')).toContain('Edit Boat')
    expect(container.querySelector<HTMLButtonElement>('.personal-boats__add')?.classList.contains('personal-action--secondary')).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('.personal-boats__default .personal-action--primary')?.disabled).toBe(true)
    await click('Add Boat')
    await click('Save Boat')
    expect(container.textContent).toContain('Enter a Name, Class or Sail Number.')
    expect(api.createPersonalBoat).not.toHaveBeenCalled()
    await input('Class', ' sNiPe ')
    await click('Save Boat')
    expect(api.createPersonalBoat).toHaveBeenCalledWith('personal/token', {
      name: null, sailing_class: 'sNiPe', sail_number: null,
    }, expect.any(AbortSignal))
    expect(container.textContent).toContain('Boat saved.')
    expect(container.textContent).toContain('Snipe')
    expect(container.textContent).toContain('Current: No default Boat')
    expect(api.updatePersonalDefaultBoat).not.toHaveBeenCalled()
    expect(onBoatSaved).toHaveBeenCalledWith({ id: 'new-1', name: null, sailing_class: 'Snipe', sail_number: null })
  })

  it('edits metadata, preserves form values after error and Cancel discards changes', async () => {
    vi.mocked(api.updatePersonalBoat).mockRejectedValueOnce(new Error('secret'))
      .mockResolvedValueOnce({ ...owned, name: 'New name', sailing_class: '49er', sail_number: '7' })
    await mount()
    await click('Edit Boat')
    await input('Name', 'Abandoned')
    await click('Cancel')
    expect(api.updatePersonalBoat).not.toHaveBeenCalled()
    await click('Edit Boat')
    expect(container.querySelector<HTMLInputElement>('.personal-boats__form input')?.value).toBe('Mistral')
    await input('Name', 'New name')
    await input('Class', '49er')
    await input('Sail Number', '7')
    await click('Save Boat')
    expect(container.textContent).toContain('Could not save Boat. Please try again.')
    expect(container.textContent).not.toContain('secret')
    expect(container.querySelector<HTMLInputElement>('.personal-boats__form input')?.value).toBe('New name')
    await click('Save Boat')
    expect(api.updatePersonalBoat).toHaveBeenLastCalledWith('personal/token', 'owned-1', {
      name: 'New name', sailing_class: '49er', sail_number: '7',
    }, expect.any(AbortSignal))
    expect(container.textContent).toContain('New name · 49er · 7')
    expect(onBoatSaved).toHaveBeenCalledWith({ ...owned, name: 'New name', sailing_class: '49er', sail_number: '7' })
  })

  it('filters Class suggestions, supports keyboard focus and accepts free text', async () => {
    vi.mocked(api.createPersonalBoat).mockResolvedValue({ id: 'new', name: null, sailing_class: 'New Class', sail_number: null })
    await mount()
    await click('Add Boat')
    const field = await input('Class', 'il')
    expect([...container.querySelectorAll('.personal-boats__suggestions button')].map((button) => button.textContent)).toEqual(['ILCA 7'])
    await act(async () => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(document.activeElement?.textContent).toBe('ILCA 7')
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })) })
    expect(document.activeElement).toBe(field)
    await click('ILCA 7')
    expect(field.value).toBe('ILCA 7')
    expect(document.activeElement).toBe(field)
    await input('Class', '49')
    expect(container.textContent).toContain('49er')
    await click('49er')
    expect(field.value).toBe('49er')
    await input('Class', 'New Class')
    expect(container.querySelectorAll('.personal-boats__suggestions button')).toHaveLength(0)
    await click('Save Boat')
    expect(api.createPersonalBoat).toHaveBeenCalledWith('personal/token', {
      name: null, sailing_class: 'New Class', sail_number: null,
    }, expect.any(AbortSignal))
    await click('Add Boat')
    await input('Class', 'new')
    expect(container.textContent).toContain('New Class')
    expect([...container.querySelectorAll('.personal-boats__suggestions button')].map((button) => button.textContent)).toEqual(['New Class'])
  })

  it('handles 409 by explicit suggested or new spelling choices and clears stale confirmation', async () => {
    vi.mocked(api.createPersonalBoat)
      .mockRejectedValueOnce(new api.BoatClassConfirmationRequiredError('Sinpe', 'Snipe'))
      .mockResolvedValueOnce({ id: 'new-1', name: 'Boat', sailing_class: 'Snipe', sail_number: null })
      .mockRejectedValueOnce(new api.BoatClassConfirmationRequiredError('Sinpe', 'Snipe'))
      .mockResolvedValueOnce({ id: 'new-2', name: 'Boat', sailing_class: 'Sinpe', sail_number: null })
    await mount()
    await click('Add Boat')
    await input('Name', 'Boat')
    await input('Class', 'Sinpe')
    await click('Save Boat')
    expect(container.textContent).toContain('Use known Class “Snipe” for “Sinpe”')
    expect(document.activeElement?.textContent).toBe('Use Snipe')
    expect(container.querySelector<HTMLInputElement>('.personal-boats__form input')?.value).toBe('Boat')
    await click('Use Snipe')
    expect(api.createPersonalBoat).toHaveBeenNthCalledWith(2, 'personal/token', {
      name: 'Boat', sailing_class: 'Snipe', sail_number: null,
    }, expect.any(AbortSignal))
    await click('Add Boat')
    await input('Name', 'Boat')
    await input('Class', 'Sinpe')
    await click('Save Boat')
    await input('Class', 'Sinpe new')
    expect(container.textContent).not.toContain('Use known Class')
    await input('Class', 'Sinpe')
    await click('Save Boat')
    // The previous confirmation is gone; an ordinary Save remains available.
    expect(api.createPersonalBoat).toHaveBeenCalledTimes(4)
  })

  it('confirms retention of the submitted spelling with the explicit flag', async () => {
    vi.mocked(api.createPersonalBoat)
      .mockRejectedValueOnce(new api.BoatClassConfirmationRequiredError('Sinpe', 'Snipe'))
      .mockResolvedValueOnce({ id: 'new', name: null, sailing_class: 'Sinpe', sail_number: null })
    await mount()
    await click('Add Boat')
    await input('Class', 'Sinpe')
    await click('Save Boat')
    await click('Keep Sinpe')
    expect(api.createPersonalBoat).toHaveBeenLastCalledWith('personal/token', {
      name: null, sailing_class: 'Sinpe', sail_number: null, confirm_new_class: true,
    }, expect.any(AbortSignal))
    expect(container.textContent).toContain('Boat saved.')
  })

  it.each([
    [' ilca   7 ', 'ILCA 7'],
    ['49ER', '49er'],
  ])('displays the backend canonical Class for %s', async (submitted, canonical) => {
    vi.mocked(api.createPersonalBoat).mockResolvedValue({ id: 'new', name: null, sailing_class: canonical, sail_number: null })
    await mount()
    await click('Add Boat')
    await input('Class', submitted)
    await click('Save Boat')
    expect(container.querySelector('.personal-boats__list')?.textContent).toContain(canonical)
    expect(onBoatSaved).toHaveBeenCalledWith({ id: 'new', name: null, sailing_class: canonical, sail_number: null })
  })

  it('sets and clears default, preserving a historical default until explicit change', async () => {
    vi.mocked(api.getPersonalDefaultBoat).mockResolvedValue({ default_boat_id: 'legacy-1' })
    vi.mocked(api.updatePersonalDefaultBoat)
      .mockResolvedValueOnce({ default_boat_id: 'owned-1' })
      .mockResolvedValueOnce({ default_boat_id: null })
    await mount()
    expect(container.textContent).toContain('Current: Historical or unavailable Boat')
    expect(container.querySelector<HTMLSelectElement>('.personal-boats__default select')?.value).toBe('__keep__')
    await chooseDefault('owned-1')
    await click('Cancel Default Boat')
    expect(api.updatePersonalDefaultBoat).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLSelectElement>('.personal-boats__default select')?.value).toBe('__keep__')
    await chooseDefault('owned-1')
    await click('Save Default Boat')
    expect(api.updatePersonalDefaultBoat).toHaveBeenNthCalledWith(1, 'personal/token', 'owned-1', expect.any(AbortSignal))
    expect(container.textContent).toContain('Current: Mistral · Snipe · 42')
    await chooseDefault('')
    await click('Save Default Boat')
    expect(api.updatePersonalDefaultBoat).toHaveBeenNthCalledWith(2, 'personal/token', null, expect.any(AbortSignal))
    expect(container.textContent).toContain('Current: No default Boat')
  })

  it('loads an empty catalogue, retries a failed read, and removes private UI on denial', async () => {
    vi.mocked(api.getPersonalBoats).mockRejectedValueOnce(new Error('secret')).mockResolvedValueOnce([])
    vi.mocked(api.getPersonalBoatClasses).mockResolvedValue([])
    await mount()
    expect(container.textContent).toContain('Could not load My Boats.')
    expect(container.textContent).not.toContain('secret')
    await click('Retry')
    expect(container.textContent).toContain('No Boats registered yet.')
    vi.mocked(api.createPersonalBoat).mockRejectedValue(new api.PersonalTackBarNotFoundError())
    await click('Add Boat')
    await input('Name', 'Boat')
    await click('Save Boat')
    expect(onUnavailable).toHaveBeenCalledTimes(1)
  })

  it('guards duplicate Boat and default writes, then allows retry after recoverable errors', async () => {
    let rejectBoat!: (error: Error) => void
    let rejectDefault!: (error: Error) => void
    vi.mocked(api.createPersonalBoat).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectBoat = reject }))
      .mockResolvedValueOnce({ id: 'new', name: 'Boat', sailing_class: null, sail_number: null })
    vi.mocked(api.updatePersonalDefaultBoat).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectDefault = reject }))
      .mockResolvedValueOnce({ default_boat_id: 'owned-1' })
    await mount()
    await click('Add Boat')
    await input('Name', 'Boat')
    await click('Save Boat')
    expect(container.textContent).toContain('Saving Boat…')
    expect(container.querySelector<HTMLButtonElement>('.personal-boats__form button[type="submit"]')?.disabled).toBe(true)
    expect([...container.querySelectorAll<HTMLButtonElement>('.personal-boats__form .personal-activity__actions button')].find((button) => button.textContent === 'Cancel')?.disabled).toBe(true)
    await click('Save Boat')
    expect(api.createPersonalBoat).toHaveBeenCalledTimes(1)
    await act(async () => rejectBoat(new Error('secret')))
    await click('Save Boat')
    expect(api.createPersonalBoat).toHaveBeenCalledTimes(2)
    await chooseDefault('owned-1')
    await click('Save Default Boat')
    expect(container.textContent).toContain('Saving Default Boat…')
    expect([...container.querySelectorAll<HTMLButtonElement>('.personal-boats__default button')].every((button) => button.disabled)).toBe(true)
    await click('Save Default Boat')
    expect(api.updatePersonalDefaultBoat).toHaveBeenCalledTimes(1)
    await act(async () => rejectDefault(new Error('secret')))
    expect(container.textContent).toContain('Could not save Default Boat. Please try again.')
    await click('Save Default Boat')
    expect(api.updatePersonalDefaultBoat).toHaveBeenCalledTimes(2)
  })
})
