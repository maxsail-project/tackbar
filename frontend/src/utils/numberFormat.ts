/** #204: shared Viewer number presentation. Display only; never feed these strings back into calculations. */

/** Typographic minus sign (U+2212) used for every displayed negative number. */
export const MINUS_SIGN = '−'

/** Replaces a leading ASCII hyphen-minus with the typographic minus; a value that displays as zero stays unsigned. */
export function withTypographicMinus(text: string) {
  if (!text.startsWith('-')) return text
  const magnitude = text.slice(1)
  return /^0(\.0+)?$/.test(magnitude) ? magnitude : `${MINUS_SIGN}${magnitude}`
}

/** `value.toFixed(fractionDigits)` with the typographic minus. */
export function formatFixed(value: number, fractionDigits: number) {
  return withTypographicMinus(value.toFixed(fractionDigits))
}

/** Integers as-is, otherwise one decimal; typographic minus. */
export function formatCompact(value: number) {
  return withTypographicMinus(Number.isInteger(value) ? String(value) : value.toFixed(1))
}

/** Rounded integer with the typographic minus. */
export function formatRounded(value: number) {
  return withTypographicMinus(String(Math.round(value)))
}

/** Explicit sign for non-zero values: `+1.5` / `−1.5`; zero stays unsigned. */
export function formatSignedFixed(value: number, fractionDigits: number) {
  const text = formatFixed(value, fractionDigits)
  return value > 0 ? `+${text}` : text
}

/** SOG value without unit: one decimal, `—` when unavailable. */
export function formatSogNumber(value: number | null | undefined) {
  return value == null ? '—' : formatFixed(value, 1)
}

/** SOG value with unit: `5.7 kt`, `—` when unavailable. */
export function formatSog(value: number | null | undefined) {
  return value == null ? '—' : `${formatFixed(value, 1)} kt`
}
