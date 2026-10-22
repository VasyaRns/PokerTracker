import Dexie from 'dexie'
import { positionInCircle } from '../domain/positions'
import { validateHand } from '../domain/validate'
import type { Hand } from '../domain/types'
import { definedOnly } from './clean'
import { db } from './db'

export type HandPatch = Partial<Pick<Hand, 'position' | 'facing' | 'action' | 'skipped' | 'resultBB' | 'note' | 'vsRaise'>>

export async function addHands(hands: readonly Hand[]): Promise<void> {
  if (hands.length === 0) return
  await db.transaction('rw', db.hands, db.sessions, async () => {
    for (const hand of hands) {
      if (!hand.sessionId) throw new Error('У руки нет сессии')
      const session = await db.sessions.get(hand.sessionId)
      if (!session) throw new Error('Рука ссылается на несуществующую сессию')
      const validation = validateHand(hand)
      if (!validation.ok) throw new Error(validation.reason)
      if (!positionInCircle(hand.position, session.tableSize)) {
        throw new Error('Позиция не входит в круг стола')
      }
    }
    await db.hands.bulkAdd(hands.map((hand) => definedOnly(hand)))
  })
}

export async function updateHand(id: string, patch: HandPatch, now = Date.now()): Promise<Hand> {
  const existing = await db.hands.get(id)
  if (!existing) throw new Error('Рука не найдена')
  const next: Hand = {
    ...existing,
    ...patch,
    id,
    sessionId: existing.sessionId,
    batchId: existing.batchId,
    createdAt: existing.createdAt,
    updatedAt: now,
  }
  if (patch.note !== undefined) {
    const note = patch.note.trim()
    if (note) next.note = note
    else delete next.note
  }
  if ('resultBB' in patch && patch.resultBB == null) delete next.resultBB
  if ('vsRaise' in patch && patch.vsRaise == null) delete next.vsRaise
  if ('skipped' in patch && !patch.skipped) delete next.skipped
  if (next.skipped) next.facing = null
  const validation = validateHand(next)
  if (!validation.ok) throw new Error(validation.reason)
  const stored = definedOnly(next)
  await db.hands.put(stored)
  return stored
}

export async function deleteHand(id: string): Promise<void> {
  await db.hands.delete(id)
}

/** batchId не индексируется: пачка маленькая, undo снимает её целиком. */
export async function deleteBatch(batchId: string): Promise<number> {
  return db.hands.filter((hand) => hand.batchId === batchId).delete()
}

export async function listHandsBySession(sessionId: string): Promise<Hand[]> {
  return db.hands
    .where('[sessionId+createdAt]')
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .toArray()
}

/**
 * Сначала сессии с `date` в диапазоне включительно, затем руки по `sessionId`.
 * `createdAt` на отбор не влияет.
 */
export async function listHandsInPeriod(from: string, to: string): Promise<Hand[]> {
  const sessions = await db.sessions.where('date').between(from, to, true, true).toArray()
  const ids = sessions.map((session) => session.id)
  if (ids.length === 0) return []
  return db.hands.where('sessionId').anyOf(ids).toArray()
}
