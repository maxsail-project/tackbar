import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TackBarBrand from './TackBarBrand'

describe('TackBar brand', () => {
  it.each([false, true])('identifies TackBar accessibly on inverted=%s surfaces', (inverted) => {
    const markup = renderToStaticMarkup(<TackBarBrand inverted={inverted} />)
    expect(markup).toMatch(/<img[^>]*alt="TackBar"/)
    expect(markup).not.toContain('aria-hidden')
  })
})
