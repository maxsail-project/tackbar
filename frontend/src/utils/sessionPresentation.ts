const UTC_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function parseTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

function utcDate(date: Date) {
  return `${date.getUTCDate()} ${UTC_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

function utcTime(date: Date) {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

export function formatSessionDate(timestamp: string) {
  const date = parseTimestamp(timestamp)
  return date ? utcDate(date) : timestamp
}

export function formatSessionTime(timestamp: string) {
  const date = parseTimestamp(timestamp)
  return date ? `${utcTime(date)} UTC` : timestamp
}

export function formatSessionRange(startTimestamp: string, endTimestamp: string) {
  const start = parseTimestamp(startTimestamp)
  const end = parseTimestamp(endTimestamp)
  if (!start || !end) return `${startTimestamp} – ${endTimestamp}`

  const startDate = utcDate(start)
  const endDate = utcDate(end)
  if (startDate === endDate) {
    return `${startDate} · ${utcTime(start)}–${utcTime(end)} UTC`
  }
  return `${startDate} ${utcTime(start)} UTC – ${endDate} ${utcTime(end)} UTC`
}
