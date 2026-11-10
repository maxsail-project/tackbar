import { renderToStaticMarkup } from 'react-dom/server'
import { matchRoutes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appRoutes } from '../App'
import ConsentConditionsPage from './ConsentConditionsPage'
import HistoricalConsentConditionsPage from './HistoricalConsentConditionsPage'

afterEach(() => vi.unstubAllGlobals())

describe('canonical consent conditions page', () => {
  it('renders the canonical bilingual v0.7.21 conditions without an API request', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const markup = renderToStaticMarkup(<ConsentConditionsPage />)

    expect(markup).toContain('TackBar Pilot Participation Conditions')
    expect(markup).toContain('Condiciones de Participación en el Piloto TackBar')
    expect(markup).toContain('Agreement version / Versión del acuerdo: v0.7.21')
    expect(markup).toContain('Shared Session responses do not expose full contact email addresses.')
    expect(markup).toContain('Las respuestas de Sessions compartidas no exponen direcciones de email de contacto completas.')
    expect(markup).toContain('id="conditions-en">English</h2>')
    expect(markup).toContain('id="conditions-es">Español</h2>')
    expect(markup).toContain('Sending a track to this channel starts technical processing, but does not constitute consent to participate.')
    expect(markup).toContain('Enviar un track a este canal inicia el procesamiento técnico, pero no constituye consentimiento para participar.')
    expect(markup).toContain('If you withdraw consent, your Activities immediately stop being visible in shared Sessions.')
    expect(markup).toContain('Si retiras el consentimiento, tus Activities dejan inmediatamente de ser visibles en Sessions compartidas.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves read-only bilingual v0.6.5 conditions for pending historical requests', () => {
    const markup = renderToStaticMarkup(<HistoricalConsentConditionsPage />)
    expect(markup).toContain('Agreement version / Versión del acuerdo: v0.6.5')
    expect(markup).toContain('id="conditions-en">English</h2>')
    expect(markup).toContain('id="conditions-es">Español</h2>')
    expect(markup).not.toContain('Shared Session responses do not expose full contact email addresses.')
    expect(markup).not.toContain('<button')
  })

  it('routes the public current page and both version-specific agreements separately', () => {
    for (const path of ['/consent/conditions', '/consent/conditions/v0.7.21', '/consent/conditions/v0.6.5']) {
      expect(matchRoutes(appRoutes, path)?.at(-1)?.route.path).toBe(path)
    }
  })

  it('is read-only and contains no consent or acceptance action', () => {
    const markup = renderToStaticMarkup(<ConsentConditionsPage />)

    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('<form')
    expect(markup).not.toContain('/api/consent/')
    expect(markup).not.toContain('/consent/request-capability')
  })
})
