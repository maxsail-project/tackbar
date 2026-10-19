import { Children, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AboutControl, { AboutDialog, formatReleaseIdentity, PublicHeaderBrand } from './AboutControl'

describe('public About control', () => {
  it('places the release identity directly beneath the logo', () => {
    const brand = renderToStaticMarkup(<PublicHeaderBrand family="Californian" version="v0.7.12" />)
    expect(brand).toMatch(/<img[^>]*alt="TackBar"[^>]*><span class="public-header-release">Californian · v0\.7\.12<\/span>/)
    expect(renderToStaticMarkup(<AboutControl />)).toContain('>About</button>')
  })

  it.each([
    ['Californian', 'v0.7.12', 'Californian · v0.7.12'],
    ['Californian', undefined, 'Californian'],
    [undefined, 'v0.7.12', 'v0.7.12'],
    [undefined, undefined, ''],
    [' ', '', ''],
  ])('formats family %j and exact version %j as %j', (family, version, expected) => {
    expect(formatReleaseIdentity(family, version)).toBe(expected)
    const header = renderToStaticMarkup(<PublicHeaderBrand family={family ?? ''} version={version ?? ''} />)
    expect(header.includes('public-header-release')).toBe(Boolean(expected))
    if (expected) expect(header).toContain(`>${expected}</span>`)
    const markup = renderToStaticMarkup(<AboutDialog family={family} version={version} onClose={() => {}} onDismiss={() => {}} />)
    expect(markup.includes('about-dialog__release')).toBe(Boolean(expected))
    if (expected) expect(markup).toContain(`>${expected}</p>`)
  })

  it('includes the agreed project content and usable links', () => {
    const markup = renderToStaticMarkup(<AboutDialog onClose={() => {}} onDismiss={() => {}} />)
    for (const text of ['Sail. Debrief. Learn.', 'independent open-source', 'collaborative post-sailing debriefing', 'Experimental pilot', 'Maximiliano Mannise', 'TackBar supports the conversation. It doesn&#x27;t replace it.']) {
      expect(markup).toContain(text)
    }
    expect(markup).toContain('href="mailto:hello@tackbar.eu"')
    expect(markup).toContain('Website: <a href="https://tackbar.eu" target="_blank" rel="noopener noreferrer">tackbar.eu</a>')
    expect(markup).toContain('href="https://github.com/maxsail-project/tackbar"')
    expect(markup).toContain('href="https://github.com/maxsail-project/tackbar/blob/main/LICENSE"')
    expect(markup).toMatch(/Maximiliano Mannise <a[^>]*href="https:\/\/www\.linkedin\.com\/in\/mmannise"[^>]*>LI<\/a>\./)
    expect(markup).toContain('rel="noopener noreferrer" aria-label="Maximiliano Mannise on LinkedIn"')
  })

  it('wires the explicit close action and native dialog close event', () => {
    const onClose = vi.fn()
    const onDismiss = vi.fn()
    const dialog = AboutDialog({ onClose, onDismiss })
    const heading = Children.toArray(dialog.props.children)[0] as ReactElement<{ children: ReactElement[] }>
    const closeButton = Children.toArray(heading.props.children)[1] as ReactElement<{ onClick: () => void; 'aria-label': string }>
    expect(dialog.props['aria-labelledby']).toBe('about-title')
    expect(closeButton.props['aria-label']).toBe('Close About')
    closeButton.props.onClick()
    dialog.props.onClose()
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
