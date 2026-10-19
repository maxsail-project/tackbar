import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  formatRemainingLifetime,
  formatAccessExpiry,
  SessionSharePanel,
  SessionSummaryHeading,
  SessionViewerHeader,
  temporaryShareUrl,
} from './SessionShare'


describe('temporary Session sharing presentation', () => {
  it('offers About in the header shared by original and temporary Viewers', () => {
    vi.stubEnv('VITE_APP_RELEASE_FAMILY', 'Californian')
    vi.stubEnv('VITE_APP_VERSION', 'v0.7.12')
    const header = renderToStaticMarkup(<SessionViewerHeader />)
    vi.unstubAllEnvs()

    expect(header).toContain('viewer-header')
    expect(header).toContain('>About</button>')
    expect(header).toMatch(/alt="TackBar"[^>]*><span class="public-header-release">Californian · v0\.7\.12<\/span>/)
    expect(header).not.toContain('Share')
    expect(header).not.toContain('Shared access')
  })

  it('shows the contextual QR-labelled Share action only for original Session access', () => {
    const original = renderToStaticMarkup(
      <SessionSummaryHeading
        access={{ kind: 'original', token: 'original-private-token' }}
        identity="Mahón · 16 Sep 2026"
        expiresAt="2026-11-11T17:35:00Z"
        onShare={vi.fn()}
      />,
    )
    const temporary = renderToStaticMarkup(
      <SessionSummaryHeading
        access={{
          kind: 'temporary',
          token: 'temporary-private-token',
          expiresAt: '2099-01-01T12:00:00Z',
        }}
        identity="16 Sep 2026"
        expiresAt="2026-10-14T17:35:00Z"
      />,
    )

    expect(original).toContain('>Session</span>')
    expect(original).toContain('>Mahón · 16 Sep 2026</h1>')
    expect(original).toContain('Available until')
    expect(original).toContain(formatAccessExpiry('2026-11-11T17:35:00Z'))
    expect(original).toContain('session-share-button__icon')
    expect(original).toContain('<span>Share</span>')
    expect(temporary).toContain('>Shared Session</span>')
    expect(temporary).toContain('>16 Sep 2026</h1>')
    expect(temporary).toContain('Available until')
    expect(temporary).toContain(formatAccessExpiry('2026-10-14T17:35:00Z'))
    expect(temporary).not.toContain('session-share-button')
    expect(temporary).not.toContain('<span>Share</span>')
    expect(temporary).not.toContain('original-private-token')
  })

  it('formats an access expiry as a fixed local date and time', () => {
    expect(
      formatAccessExpiry('2026-10-14T17:35:00Z', 'en-GB', 'UTC'),
    ).toBe('14 Oct 2026 · 17:35')
  })

  it('renders a local QR presentation containing only the temporary URL', () => {
    const markup = renderToStaticMarkup(
      <SessionSharePanel
        share={{
          path: '/q/temporary-private-token',
          expires_at: '2099-01-01T12:00:00Z',
        }}
        status="ready"
        onClose={vi.fn()}
        origin="https://tackbar.example"
      />,
    )

    expect(markup).toContain('<svg')
    expect(markup).toContain('Temporary Session access QR code')
    expect(markup).toContain('Scan to open this Session')
    expect(markup).toContain('Access expires in')
    expect(markup).not.toContain('/s/')
    expect(markup).not.toContain('original-private-token')
  })

  it('formats a low-frequency remaining lifetime and builds the temporary URL', () => {
    const now = Date.parse('2031-06-01T12:00:00Z')
    expect(formatRemainingLifetime('2031-06-02T19:18:00Z', now)).toBe('31h 18m')
    expect(formatRemainingLifetime('2031-06-01T12:00:00Z', now)).toBe('Expired')
    expect(temporaryShareUrl('/q/token', 'https://tackbar.example/')).toBe(
      'https://tackbar.example/q/token',
    )
  })
})
