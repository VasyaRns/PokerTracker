import type { Position } from './types'

/** Порядок действия префлоп. Следующая рука героя — шаг раньше по этому списку. */
const CIRCLES: Record<number, readonly Position[]> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['UTG', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  10: ['UTG', 'UTG+1', 'UTG+2', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
}

export function positionsFor(tableSize: number): readonly Position[] {
  const circle = CIRCLES[tableSize]
  if (!circle) throw new Error(`Размер стола ${tableSize} вне диапазона 2..10`)
  return circle
}

export function earliestPosition(tableSize: number): Position {
  return positionsFor(tableSize)[0]
}

export function positionInCircle(position: Position, tableSize: number): boolean {
  return positionsFor(tableSize).includes(position)
}

/**
 * Дилер сдвигает метку на шаг раньше по кругу.
 * С UTG на девятиместном столе следующая рука — BB.
 */
export function nextPosition(position: Position, tableSize: number): Position {
  const circle = positionsFor(tableSize)
  const index = circle.indexOf(position)
  if (index === -1) return circle[0]
  return circle[(index - 1 + circle.length) % circle.length]
}

/** Если позиции в новом круге нет, подсказка встаёт на самую раннюю. */
export function coercePosition(position: Position | null | undefined, tableSize: number): Position {
  if (position && positionInCircle(position, tableSize)) return position
  return earliestPosition(tableSize)
}
