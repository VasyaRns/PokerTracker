/** Календарный день в заданной таймзоне. Не `toISOString`: полночь UTC — разные дни в LA и Москве. */
export function formatLocalDate(timestamp: number, timeZone?: string): string {
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) throw new Error('Не удалось собрать локальную дату')
  return `${year}-${month}-${day}`
}

export function formatDisplayDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new Error('Дата в формате ГГГГ-ММ-ДД')
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Период режется по `session.date`, не по `createdAt`.
 * Границы включительны, сравнение строк YYYY-MM-DD.
 */
export function filterHandsBySessionDate<
  S extends { id: string; date: string },
  H extends { sessionId: string },
>(sessions: readonly S[], hands: readonly H[], from?: string, to?: string): H[] {
  const ids = new Set(
    sessions
      .filter((session) => {
        if (from && session.date < from) return false
        if (to && session.date > to) return false
        return true
      })
      .map((session) => session.id),
  )
  return hands.filter((hand) => ids.has(hand.sessionId))
}
