import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  formatRemainingLifetime,
  SessionSharePanel,
  SessionViewerHeader,
  temporaryShareUrl,
} from './SessionShare'


describe('temporary Session sharing presentation', () => {
  it('shows Share / QR only for original Session access', () => {
    const original = renderToStaticMarkup(
      <SessionViewerHeader
        access={{ kind: 'original', token: 'original-private-token' }}
        onShare={vi.fn()}
      />,
    )
    const temporary = renderToStaticMarkup(
      <SessionViewerHeader
        access={{
          kind: 'temporary',
          token: 'temporary-private-token',
          expiresAt: '2099-01-01T12:00:00Z',
        }}
      />,
    )

    expect(original).toContain('Share / QR')
    expect(temporary).toContain('Shared access')
    expect(temporary).toContain('left')
    expect(temporary).not.toContain('Share / QR')
    expect(temporary).not.toContain('original-private-token')
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
