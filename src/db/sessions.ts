import { formatLocalDate } from '../domain/dates'
import type { Format, Session } from '../domain/types'
import { definedOnly } from './clean'
import { db } from './db'

export interface SessionDraft {
  date: string
  place: string
  format: Format
  tableSize: number
  note?: string
  buyIn?: number
  prize?: number
}

export type SessionPatch = Partial<SessionDraft>

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function assertSessionShape(session: Pick<Session, 'date' | 'format' | 'tableSize'>): void {
  if (!DATE.test(session.date)) throw new Error('Дата в формате ГГГГ-ММ-ДД')
  if (session.format !== 'cash' && session.format !== 'tournament') throw new Error('Формат: кэш или турнир')
  if (!Number.isInteger(session.tableSize) || session.tableSize < 2 || session.tableSize > 10) {
    throw new Error('Размер стола — целое от 2 до 10')
  }
}

/** Открытая сессия ищется в памяти: у неё нет `endedAt`, и это поле не индексируется. */
export async function getOpenSession(): Promise<Session | undefined> {
  const sessions = await db.sessions.toArray()
  return sessions.find((session) => session.endedAt == null)
}

let pendingOpen: Promise<Session> | null = null

export function ensureOpenSession(now = Date.now()): Promise<Session> {
  if (pendingOpen) return pendingOpen
  pendingOpen = openOrCreate(now).finally(() => {
    pendingOpen = null
  })
  return pendingOpen
}

async function openOrCreate(now: number): Promise<Session> {
  const existing = await getOpenSession()
  if (existing) return existing
  const session: Session = {
    id: crypto.randomUUID(),
    startedAt: now,
    updatedAt: now,
    date: formatLocalDate(now),
    place: '',
    format: 'cash',
    tableSize: 9,
  }
  await db.sessions.add(session)
  return session
}

async function endOpenSessions(exceptId: string | null, now: number): Promise<void> {
  const sessions = await db.sessions.toArray()
  for (const session of sessions) {
    if (session.id === exceptId || session.endedAt != null) continue
    await db.sessions.update(session.id, { endedAt: now, updatedAt: now })
  }
}

/** Новая сессия открыта. Прежняя открытая при этом завершается. */
export async function createSession(draft: SessionDraft, now = Date.now()): Promise<Session> {
  assertSessionShape(draft)
  return db.transaction('rw', db.sessions, async () => {
    await endOpenSessions(null, now)
    const note = draft.note?.trim()
    const session = definedOnly({
      id: crypto.randomUUID(),
      startedAt: now,
      updatedAt: now,
      date: draft.date,
      place: draft.place.trim(),
      format: draft.format,
      tableSize: draft.tableSize,
      note: note || undefined,
      buyIn: draft.buyIn,
      prize: draft.prize,
    })
    await db.sessions.add(session)
    return session
  })
}

export async function updateSession(id: string, patch: SessionPatch, now = Date.now()): Promise<Session> {
  const existing = await db.sessions.get(id)
  if (!existing) throw new Error('Сессия не найдена')
  const next: Session = { ...existing, id, updatedAt: now }
  if (patch.date !== undefined) next.date = patch.date
  if (patch.place !== undefined) next.place = patch.place.trim()
  if (patch.format !== undefined) next.format = patch.format
  if (patch.tableSize !== undefined) next.tableSize = patch.tableSize
  if (patch.note !== undefined) {
    const note = patch.note.trim()
    if (note) next.note = note
    else delete next.note
  }
  if ('buyIn' in patch) {
    if (patch.buyIn == null) delete next.buyIn
    else next.buyIn = patch.buyIn
  }
  if ('prize' in patch) {
    if (patch.prize == null) delete next.prize
    else next.prize = patch.prize
  }
  assertSessionShape(next)
  const stored = definedOnly(next)
  await db.sessions.put(stored)
  return stored
}

export async function endSession(id: string, now = Date.now()): Promise<void> {
  const existing = await db.sessions.get(id)
  if (!existing) throw new Error('Сессия не найдена')
  if (existing.endedAt != null) return
  await db.sessions.update(id, { endedAt: now, updatedAt: now })
}

/** Снова открыть сессию: снять `endedAt`. Другая открытая завершается. */
export async function reopenSession(id: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const existing = await db.sessions.get(id)
    if (!existing) throw new Error('Сессия не найдена')
    await endOpenSessions(id, now)
    await db.sessions.where('id').equals(id).modify((session) => {
      delete session.endedAt
      session.updatedAt = now
    })
  })
}
