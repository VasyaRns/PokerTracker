import { allowedActions } from './actions'
import type { Action, Facing, Hand, Position, VsRaise } from './types'

export interface Validatable {
  position: Position
  facing: Facing | null
  action: Action
  skipped?: boolean
  vsRaise?: VsRaise
}

export type Validation = { ok: true } | { ok: false; reason: string }

/**
 * `vsRaise` только если действие — call или raise, ситуация — фолд до героя или лимп,
 * и рука не skipped и не walk. Остальные комбинации отвергаются.
 */
export function validateHand(hand: Validatable): Validation {
  if (hand.skipped) {
    if (hand.action !== 'fold' || hand.facing !== null) {
      return { ok: false, reason: 'Пропущенный фолд — это фолд без ситуации' }
    }
    if (hand.vsRaise != null) {
      return { ok: false, reason: 'У пропущенного фолда нет ответа на рейз' }
    }
    return { ok: true }
  }

  if (hand.facing == null) {
    return { ok: false, reason: 'Ситуация не указана' }
  }

  if (!allowedActions(hand.position, hand.facing).includes(hand.action)) {
    return { ok: false, reason: 'Такое действие здесь нельзя' }
  }

  if (hand.vsRaise != null) {
    const actionOk = hand.action === 'call' || hand.action === 'raise'
    const facingOk = hand.facing === 'foldedToMe' || hand.facing === 'limp'
    if (!actionOk || !facingOk) {
      return { ok: false, reason: 'Ответ на рейз только после колла или рейза, если до вас был фолд или лимп' }
    }
  }

  return { ok: true }
}

export function assertValidHand(hand: Validatable): void {
  const result = validateHand(hand)
  if (!result.ok) throw new Error(result.reason)
}

export type HandRules = Pick<Hand, 'position' | 'facing' | 'action' | 'skipped' | 'vsRaise'>
