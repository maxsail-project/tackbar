/**
 * Neutral displayed difference shared by the Maneuver Insights tables: names the higher operand
 * (P/C by default, or e.g. L/R) with the rounded absolute difference, or Similar when it rounds to zero.
 */
export function roundedInsightComparison(
  first: number | null,
  second: number | null,
  unit: '°' | 's',
  labels: readonly [string, string] = ['P', 'C'],
) {
  if (first === null || second === null) return '—'
  const difference = Math.abs(first - second).toFixed(1)
  return difference === '0.0' ? 'Similar' : `${first > second ? labels[0] : labels[1]} +${difference}${unit}`
}
