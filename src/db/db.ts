import Dexie, { type EntityTable } from 'dexie'
import type { Hand, Meta, Session } from '../domain/types'

/**
 * База `pokertracker`, версия 1.
 * `endedAt` в индекс не входит: отсутствующее поле не индексируется.
 * `sessionId` — обычная строка-id, без заглушки `none`.
 */
export class PokerDatabase extends Dexie {
  hands!: EntityTable<Hand, 'id'>
  sessions!: EntityTable<Session, 'id'>
  meta!: EntityTable<Meta, 'id'>

  constructor() {
    super('pokertracker')
    this.version(1).stores({
      hands: 'id, createdAt, sessionId, [sessionId+createdAt]',
      sessions: 'id, date, startedAt',
      meta: 'id',
    })
  }
}

export const db = new PokerDatabase()
