// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/tackbarApi'
import type { PersonalTackBar } from '../types/personal'
import PersonalTackBarPage, { PersonalTackBarContent } from './PersonalTackBarPage'

vi.mock('../api/tackbarApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/tackbarApi')>(),
  getPersonalTackBar: vi.fn(), getPersonalActivities: vi.fn(), getPersonalBoats: vi.fn(),
  getPersonalBoatClasses: vi.fn(), getPersonalDefaultBoat: vi.fn(), updatePersonalProfile: vi.fn(),
}))

const history: PersonalTackBar = {
  email: 'sailor@example.test', name: 'Old Name', session_count: 1, last_sailing_end: null,
  sessions: [{ sailing_start: '2026-09-05T13:49:00Z', sailing_end: '2026-09-05T17:21:00Z', sailor_count: 1,
    location_label: 'Mahón', location_country: 'Spain', weather: null, session_path: '/s/shared' }],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(api.getPersonalTackBar).mockResolvedValue(history)
  vi.mocked(api.getPersonalActivities).mockResolvedValue([])
  vi.mocked(api.getPersonalBoats).mockResolvedValue([])
  vi.mocked(api.getPersonalBoatClasses).mockResolvedValue([])
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

async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('.personal-profile button')]
    .find((item) => item.textContent === label)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

async function typeName(value: string) {
  const input = container.querySelector<HTMLInputElement>('#personal-profile-name')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('My Profile', () => {
  it('starts with an empty editor when the name is unset', async () => {
    vi.mocked(api.getPersonalTackBar).mockResolvedValue({ ...history, name: null })
    await mount()
    expect(container.querySelector('.personal-profile')?.textContent).toContain('Name: Not set')
    expect(container.querySelector('.personal-profile')?.textContent).toContain('Email: sailor@example.test')
    await click('Edit Name')
    expect(container.querySelector<HTMLInputElement>('#personal-profile-name')?.value).toBe('')
    await click('Save')
    expect(api.updatePersonalProfile).not.toHaveBeenCalled()
  })

  it('shows identity and read-only email, focuses the editor, and skips unchanged or cancelled drafts', async () => {
    await mount()
    const profile = container.querySelector('.personal-profile')!
    expect(profile.textContent).toContain('Name: Old Name')
    expect(profile.textContent).toContain('Email: sailor@example.test')
    expect(profile.querySelector('input')).toBeNull()
    expect(profile.getAttribute('aria-label')).toBe('My Profile')
    expect(profile.querySelector('h2')).toBeNull()
    expect(container.querySelector('a[href="/s/shared"]')).not.toBeNull()
    expect(container.textContent).toContain('My Activities')
    const heading = container.querySelector('.personal-activity h3')
    expect(heading?.textContent).toContain('13:49–17:21')    
    expect(container.textContent).toContain('My Boats')
    await click('Edit Name')
    expect(container.querySelector<HTMLInputElement>('#personal-profile-name')?.value).toBe('Old Name')
    expect(document.activeElement).toBe(container.querySelector('#personal-profile-name'))
    await typeName('  Old Name  ')
    await click('Save')
    expect(api.updatePersonalProfile).not.toHaveBeenCalled()
    await click('Edit Name')
    await typeName('Unsaved')
    await click('Cancel')
    expect(api.updatePersonalProfile).not.toHaveBeenCalled()
    expect(profile.textContent).toContain('Old Name')
  })

  it('saves normalized name, clears it, and restores the email fallback', async () => {
    vi.mocked(api.updatePersonalProfile).mockResolvedValueOnce({ name: 'New Name' }).mockResolvedValueOnce({ name: null })
    await mount()
    await click('Edit Name')
    await typeName('  New Name  ')
    await click('Save')
    expect(api.updatePersonalProfile).toHaveBeenLastCalledWith('personal-token', 'New Name', expect.any(AbortSignal))
    expect(container.querySelector('.personal-profile')?.textContent).toContain('Name: New Name')
    expect(container.querySelector('.personal-profile [role="status"]')?.textContent).toContain('Profile saved.')
    await click('Edit Name')
    await typeName('   ')
    await click('Save')
    expect(api.updatePersonalProfile).toHaveBeenLastCalledWith('personal-token', null, expect.any(AbortSignal))
    expect(container.querySelector('.personal-profile')?.textContent).toContain('Name: Not set')
    expect(container.querySelector('.personal-profile')?.textContent).toContain('Email: sailor@example.test')
  })

  it('retains failed input for retry, blocks duplicate submission, and removes private content on denial', async () => {
    let rejectWrite!: (error: unknown) => void
    vi.mocked(api.updatePersonalProfile).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject }))
      .mockRejectedValueOnce(new api.PersonalTackBarNotFoundError())
    await mount()
    await click('Edit Name')
    await typeName('Retry Name')
    await act(async () => { container.querySelector<HTMLFormElement>('.personal-profile form')!.requestSubmit() })
    expect(container.querySelector<HTMLButtonElement>('.personal-profile button[type="submit"]')?.disabled).toBe(true)
    expect(container.querySelector('.personal-profile [role="status"]')?.textContent).toContain('Saving Profile')
    await act(async () => { container.querySelector<HTMLFormElement>('.personal-profile form')!.requestSubmit() })
    expect(api.updatePersonalProfile).toHaveBeenCalledTimes(1)
    await act(async () => rejectWrite(new Error('server detail must stay private')))
    expect(container.querySelector<HTMLInputElement>('#personal-profile-name')?.value).toBe('Retry Name')
    expect(container.querySelector('.personal-profile [role="alert"]')?.textContent).toContain('Could not save Profile')
    expect(container.textContent).not.toContain('server detail must stay private')
    await click('Save')
    expect(container.textContent).toContain('This personal link is unavailable.')
    expect(container.textContent).not.toContain('sailor@example.test')
    expect(container.querySelector('.personal-profile')).toBeNull()
  })

  it('aborts an in-flight write when the profile unmounts and ignores its late result', async () => {
    let resolveWrite!: (value: { name: string | null }) => void
    vi.mocked(api.updatePersonalProfile).mockImplementationOnce(() => new Promise((resolve) => { resolveWrite = resolve }))
    await mount()
    await click('Edit Name')
    await typeName('Late Name')
    await act(async () => { container.querySelector<HTMLFormElement>('.personal-profile form')!.requestSubmit() })
    const signal = vi.mocked(api.updatePersonalProfile).mock.calls[0][2]!
    await act(async () => root.render(<MemoryRouter><PersonalTackBarContent state={{ status: 'unavailable' }} token="personal-token" /></MemoryRouter>))
    expect(signal.aborted).toBe(true)
    await act(async () => resolveWrite({ name: 'Late Name' }))
    expect(container.textContent).toContain('This personal link is unavailable.')
    expect(container.textContent).not.toContain('Late Name')
  })
})
