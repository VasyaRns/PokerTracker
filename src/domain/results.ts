import type { Hand, Session } from './types'

export interface SessionHeadline {
  /** У турнира сумму BB заголовком не показываем. */
  showBb: boolean
  text: string
}

export function formatSigned(value: number): string {
  const abs = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.abs(value))
  if (value > 0) return `+${abs}`
  if (value < 0) return `−${abs}`
  return abs
}

export function sumResultBB(hands: readonly Hand[]): number {
  return hands.reduce((sum, hand) => sum + (hand.resultBB ?? 0), 0)
}

/** Кэш: сумма resultBB. Турнир: приз − бай-ин. */
export function sessionHeadline(session: Session, hands: readonly Hand[]): SessionHeadline {
  if (session.format === 'tournament') {
    if (session.buyIn == null && session.prize == null) {
      return { showBb: false, text: 'Итог не указан' }
    }
    const net = (session.prize ?? 0) - (session.buyIn ?? 0)
    return { showBb: false, text: formatSigned(net) }
  }
  const total = sumResultBB(hands.filter((hand) => hand.sessionId === session.id))
  return { showBb: true, text: `${formatSigned(total)} BB` }
}
