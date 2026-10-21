export function startOfUtcWeek(timestamp: number) {
  const date = new Date(timestamp)
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  date.setUTCHours(0, 0, 0, 0)
  return date.getTime()
}
