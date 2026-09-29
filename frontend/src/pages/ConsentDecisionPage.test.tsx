import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConsentRequest } from '../api/tackbarApi'
import type { PublicConsent } from '../types/consent'
import {
  ConsentDecisionContent,
  consentStateFromResponse,
  createSingleFlight,
  type ConsentPageState,
} from './ConsentDecisionPage'

const consent: PublicConsent = {
  status: 'ready',
  agreement_version: 'v0.6.5',
  expires_at: '2031-07-16T10:00:00Z',
}

afterEach(() => vi.unstubAllGlobals())

function render(state: ConsentPageState) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ConsentDecisionContent
        state={state}
        onConfirm={() => undefined}
        onRetry={() => undefined}
      />
    </MemoryRouter>,
  )
}

describe('public consent decision page', () => {
  it('renders a bilingual loading state without private context', () => {
    const markup = render({ status: 'loading' })

    expect(markup).toContain('Loading participation request…')
    expect(markup).toContain('Cargando solicitud de participación…')
    expect(markup).not.toContain('private-sailor@example.com')
    expect(markup).not.toContain('personal-capability')
  })

  it('renders the complete bilingual READY decision and no implicit submission', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const markup = render({ status: 'ready', data: consent })

    expect(markup).toContain('TackBar has received a sailing activity associated with this participation request.')
    expect(markup).toContain('Your participation is still pending.')
    expect(markup).toContain('TackBar ha recibido una actividad de navegación asociada a esta solicitud de participación.')
    expect(markup).toContain('Tu participación todavía está pendiente.')
    expect(markup).toContain('Agreement version / Versión del acuerdo: <strong>v0.6.5</strong>')
    expect(markup).toContain('href="/consent/conditions"')
    expect(markup).toContain('Participation conditions / Condiciones de participación')
    expect(markup).toContain('Confirm participation / Confirmar participación')
    expect(markup.match(/<button/g)).toHaveLength(1)
    for (const privateValue of [
      'private-sailor@example.com',
      '30000000-0000-4000-8000-000000000001',
      'personal-capability',
      'request-capability',
    ]) expect(markup).not.toContain(privateValue)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('disables the affirmative action and shows bilingual submission progress', () => {
    const markup = render({ status: 'submitting', data: consent })

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>/)
    expect(markup).toContain('Confirming participation…')
    expect(markup).toContain('Confirmando participación…')
  })

  it('performs only one task for repeated concurrent confirmation attempts', async () => {
    let resolve!: (value: PublicConsent) => void
    const task = vi.fn(() => new Promise<PublicConsent>((done) => { resolve = done }))
    const confirm = createSingleFlight(task)

    const first = confirm()
    const repeated = confirm()

    expect(task).toHaveBeenCalledTimes(1)
    expect(repeated).toBe(first)
    resolve({ ...consent, status: 'confirmed' })
    await expect(first).resolves.toMatchObject({ status: 'confirmed' })
  })

  it('renders an initial confirmed GET without POSTing or showing a consent action', async () => {
    const confirmed = { ...consent, status: 'confirmed' as const }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(confirmed), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const state = consentStateFromResponse(await getConsentRequest('request-token'))
    const markup = render(state)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/consent/request-token',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(state.status).toBe('confirmed')
    expect(markup).toContain('Participation confirmed')
    expect(markup).toContain('Your TackBar participation is now active.')
    expect(markup).toContain('Participación confirmada')
    expect(markup).toContain('Tu participación en TackBar ya está activa.')
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('/me/')
  })

  it('keeps unavailable and temporary-error states bilingual and generic', () => {
    const unavailable = render({ status: 'unavailable' })
    const error = render({ status: 'error' })

    expect(unavailable).toContain('This participation link is unavailable or has expired.')
    expect(unavailable).toContain('Este enlace de participación no está disponible o ha caducado.')
    expect(error).toContain('We could not load this participation request. Please try again.')
    expect(error).toContain('No hemos podido cargar esta solicitud de participación. Inténtalo de nuevo.')
    expect(error).toContain('Retry / Reintentar')
    expect(error).not.toContain('private backend detail')
  })
})
