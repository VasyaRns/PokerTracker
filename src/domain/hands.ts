import { earliestPosition, nextPosition, positionInCircle } from './positions'
import type { Hand, Position } from './types'

export interface FoldBatchInput {
  position: Position
  count: 1 | 2 | 3
  tableSize: number
  sessionId: string
  now: number
  batchId: string
  ids: readonly string[]
}

export interface FoldBatch {
  hands: Hand[]
  nextHint: Position
}

/**
 * Один тап «+N» — N рук с общим batchId.
 * Каждая: skipped, fold, facing null, позиция текущей подсказки, дальше круг.
 */
export function createFoldBatch(input: FoldBatchInput): FoldBatch {
  if (input.count !== 1 && input.count !== 2 && input.count !== 3) {
    throw new Error('Пачка фолдов — это 1, 2 или 3')
  }
  if (input.ids.length !== input.count) throw new Error('Для каждой руки пачки нужен id')
  if (!positionInCircle(input.position, input.tableSize)) {
    throw new Error('Подсказка не входит в круг стола')
  }

  const hands: Hand[] = []
  let position = input.position
  for (let index = 0; index < input.count; index += 1) {
    hands.push({
      id: input.ids[index],
      createdAt: input.now + index,
      updatedAt: input.now + index,
      sessionId: input.sessionId,
      batchId: input.batchId,
      position,
      facing: null,
      action: 'fold',
      skipped: true,
    })
    position = nextPosition(position, input.tableSize)
  }

  return { hands, nextHint: position }
}

/** Undo снимает все руки одного тапа. */
export function undoBatch(hands: readonly Hand[], batchId: string): Hand[] {
  return hands.filter((hand) => hand.batchId !== batchId)
}

/** Первая рука сессии — самая ранняя позиция. Иначе шаг после последней по createdAt. */
export function hintAfterHands(hands: readonly Hand[], tableSize: number): Position {
  if (hands.length === 0) return earliestPosition(tableSize)
  const last = hands.reduce((best, hand) => (hand.createdAt >= best.createdAt ? hand : best))
  if (!positionInCircle(last.position, tableSize)) return earliestPosition(tableSize)
  return nextPosition(last.position, tableSize)
}
