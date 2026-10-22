import type { Meta, Session } from '../domain/types'
import { db } from './db'

/** После каждых 5 завершённых сессий с прошлого экспорта или скрытия. */
export const EXPORT_REMINDER_EVERY = 5

export function countEnded(sessions: readonly Pick<Session, 'endedAt'>[]): number {
  return sessions.filter((session) => session.endedAt != null).length
}

export function shouldRemindExport(endedSessions: number, reminderAnchor: number): boolean {
  return endedSessions - reminderAnchor >= EXPORT_REMINDER_EVERY
}

let persistPromise: Promise<boolean> | null = null

/** Один вызов на запуск. Повторные чтения получают тот же ответ. */
export function requestPersistentStorage(): Promise<boolean> {
  if (!persistPromise) {
    persistPromise = (async () => {
      try {
        if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
        return await navigator.storage.persist()
      } catch {
        return false
      }
    })()
  }
  return persistPromise
}

export async function ensureMeta(): Promise<Meta> {
  const existing = await db.meta.get('app')
  if (existing) return existing
  const meta: Meta = { id: 'app', reminderAnchor: 0 }
  await db.meta.put(meta)
  return meta
}

export async function dismissExportReminder(): Promise<void> {
  const [sessions, meta] = await Promise.all([db.sessions.toArray(), ensureMeta()])
  await db.meta.put({ ...meta, reminderAnchor: countEnded(sessions) })
}

export async function markExported(now = Date.now()): Promise<void> {
  const [sessions, meta] = await Promise.all([db.sessions.toArray(), ensureMeta()])
  await db.meta.put({
    ...meta,
    reminderAnchor: countEnded(sessions),
    lastExportAt: now,
  })
}
