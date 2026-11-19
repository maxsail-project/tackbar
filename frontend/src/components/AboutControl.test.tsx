// @vitest-environment jsdom
import { Children, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AboutControl, { AboutDialog, formatReleaseIdentity, PublicHeaderBrand } from './AboutControl'

describe('public About control', () => {
  it('keeps the About trigger in the public controls', () => {
    expect(renderToStaticMarkup(<AboutControl />)).toContain('>About</button>')
  })

  it.each([
    ['Californian', 'v0.7.25', 'Californian · v0.7.25', 'Californian · v0.7.25', 'v0.7.25'],
    ['Californian', undefined, 'Californian', 'Californian · Release notes', 'Release notes'],
    ['Californian', ' \t ', 'Californian', 'Californian · Release notes', 'Release notes'],
    [undefined, 'v0.7.25', 'v0.7.25', 'v0.7.25', 'v0.7.25'],
    [undefined, undefined, '', 'Release notes', 'Release notes'],
    [' ', '', '', 'Release notes', 'Release notes'],
  ])('shows release notes for family %j and version %j', (family, version, identity, headerText, linkText) => {
    expect(formatReleaseIdentity(family, version)).toBe(identity)
    vi.stubEnv('VITE_APP_RELEASE_FAMILY', family)
    vi.stubEnv('VITE_APP_VERSION', version)
    const content = document.createElement('div')
    try {
      content.innerHTML = renderToStaticMarkup(<>
        <PublicHeaderBrand />
        <AboutDialog family={family} version={version} onClose={() => {}} onDismiss={() => {}} />
      </>)
    } finally {
      vi.unstubAllEnvs()
    }

    const release = content.querySelector('img[alt="TackBar"] + .public-header-release')!
    const headerLink = release.querySelector('a')!
    expect(release.textContent).toBe(headerText)
    expect(headerLink.textContent).toBe(linkText)
    expect(headerLink.hasAttribute('aria-label')).toBe(false)
    expect(headerLink.hasAttribute('aria-labelledby')).toBe(false)
    expect(headerLink.tabIndex).toBe(0)
    expect(headerLink.querySelector('svg[aria-hidden="true"][focusable="false"]')).not.toBeNull()

    const dialog = content.querySelector('dialog')!
    expect(dialog.querySelector('.about-dialog__release')?.textContent).toBe(identity || undefined)
    const aboutLink = [...dialog.querySelectorAll('a')].find((link) => link.textContent === 'Release notes')!
    for (const link of [headerLink, aboutLink]) {
      expect(link.getAttribute('href')).toBe('https://github.com/maxsail-project/tackbar/releases/latest')
      expect(link.target).toBe('_blank')
      expect(link.rel).toBe('noopener noreferrer')
    }
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
