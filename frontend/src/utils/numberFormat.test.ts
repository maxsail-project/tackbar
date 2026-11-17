import { describe, expect, it } from 'vitest'
import {
  MINUS_SIGN,
  formatCompact,
  formatFixed,
  formatRounded,
  formatSignedFixed,
  formatSog,
  formatSogNumber,
  withTypographicMinus,
} from './numberFormat'

describe('Viewer number presentation (#204)', () => {
  it('uses U+2212 for displayed negative numbers and leaves other text alone', () => {
    expect(MINUS_SIGN).toBe('−')
    expect(withTypographicMinus('-3.2')).toBe('−3.2')
    expect(withTypographicMinus('3.2')).toBe('3.2')
    expect(withTypographicMinus('—')).toBe('—')
    expect(formatFixed(-0.14, 1)).toBe('−0.1')
    expect(formatFixed(2.25, 1)).toBe((2.25).toFixed(1))
    expect(formatCompact(-4)).toBe('−4')
    expect(formatCompact(-4.25)).toBe('−4.3')
    expect(formatCompact(7)).toBe('7')
    expect(formatRounded(-12.6)).toBe('−13')
    expect(formatRounded(-0.4)).toBe('0')
  })

  it('never displays a signed zero', () => {
    expect(formatFixed(-0.04, 1)).toBe('0.0')
    expect(formatFixed(-0.004, 2)).toBe('0.00')
    expect(formatFixed(-0, 1)).toBe('0.0')
    expect(formatFixed(-0.05, 1)).toBe('−0.1')
    expect(withTypographicMinus('-0.0')).toBe('0.0')
    expect(withTypographicMinus('-0')).toBe('0')
    expect(formatSogNumber(-0.04)).toBe('0.0')
    expect(formatSignedFixed(-0.04, 1)).toBe('0.0')
    expect(formatRounded(-0.4)).toBe('0')
  })

  it('signs non-zero values explicitly and keeps zero unsigned', () => {
    expect(formatSignedFixed(1.5, 1)).toBe('+1.5')
    expect(formatSignedFixed(-1.5, 1)).toBe('−1.5')
    expect(formatSignedFixed(0, 1)).toBe('0.0')
  })

  it('shows SOG with one decimal, a spaced kt unit and — when unavailable', () => {
    expect(formatSog(5.73)).toBe('5.7 kt')
    expect(formatSog(10)).toBe('10.0 kt')
    expect(formatSog(null)).toBe('—')
    expect(formatSog(undefined)).toBe('—')
    expect(formatSogNumber(5.125)).toBe('5.1')
    expect(formatSogNumber(null)).toBe('—')
  })
})
