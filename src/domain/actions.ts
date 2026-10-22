import type { Action, Facing, Position } from './types'

const VOLUNTARY: readonly Action[] = ['fold', 'call', 'raise']

/**
 * Допустимые кнопки. Чек есть только у BB при лимпе.
 * Walk — только BB, когда до него все сбросили. Это не чек и не фолд.
 */
export function allowedActions(position: Position, facing: Facing): readonly Action[] {
  if (position === 'BB' && facing === 'foldedToMe') return ['walk']
  if (position === 'BB' && facing === 'limp') return ['check', 'raise']
  return VOLUNTARY
}
