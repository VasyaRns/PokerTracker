import { mergeByUpdatedAt } from '../domain/merge'
import { isPosition } from '../domain/stats'
import type { Action, Facing, Format, Hand, Meta, Session, VsRaise } from '../domain/types'
import { validateHand } from '../domain/validate'
import { definedOnly } from './clean'
import { db } from './db'
import { ensureMeta } from './persist'

const FACINGS = new Set<Facing>(['foldedToMe', 'limp', 'raise', 'threeBetPlus'])
const ACTIONS = new Set<Action>(['fold', 'check', 'call', 'raise', 'walk'])
const VS_RAISE = new Set<VsRaise>(['fold', 'call', 'raise'])
const FORMATS = new Set<Format>(['cash', 'tournament'])
const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface Bundle {
  version: 1
  sessions: Session[]
  hands: Hand[]
  meta?: Meta
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label}: нет поля ${key}`)
  return value
}

function requiredNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}: поле ${key} должно быть числом`)
  return value
}

function optionalNumber(record: Record<string, unknown>, key: string, label: string): number | undefined {
  if (record[key] == null) return undefined
  return requiredNumber(record, key, label)
}

function normalizeSession(value: unknown, index: number): Session {
  const label = `Сессия ${index + 1}`
  if (!isRecord(value)) throw new Error(`${label} повреждена`)
  const format = value.format
  if (typeof format !== 'string' || !FORMATS.has(format as Format)) throw new Error(`${label}: неизвестный формат`)
  const date = requiredString(value, 'date', label)
  if (!DATE.test(date)) throw new Error(`${label}: дата в формате ГГГГ-ММ-ДД`)
  const tableSize = requiredNumber(value, 'tableSize', label)
  if (!Number.isInteger(tableSize) || tableSize < 2 || tableSize > 10) {
    throw new Error(`${label}: размер стола — целое от 2 до 10`)
  }
  const place = value.place
  if (typeof place !== 'string') throw new Error(`${label}: нет места`)
  return definedOnly({
    id: requiredString(value, 'id', label),
    startedAt: requiredNumber(value, 'startedAt', label),
    updatedAt: requiredNumber(value, 'updatedAt', label),
    date,
    place,
    format: format as Format,
    tableSize,
    note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : undefined,
    endedAt: optionalNumber(value, 'endedAt', label),
    buyIn: optionalNumber(value, 'buyIn', label),
    prize: optionalNumber(value, 'prize', label),
  })
}

function normalizeHand(value: unknown, index: number): Hand {
  const label = `Рука ${index + 1}`
  if (!isRecord(value)) throw new Error(`${label} повреждена`)
  const position = requiredString(value, 'position', label)
  if (!isPosition(position)) throw new Error(`${label}: неизвестная позиция`)
  const action = requiredString(value, 'action', label)
  if (!ACTIONS.has(action as Action)) throw new Error(`${label}: неизвестное действие`)
  let facing: Facing | null = null
  if (value.facing != null) {
    if (typeof value.facing !== 'string' || !FACINGS.has(value.facing as Facing)) {
      throw new Error(`${label}: неизвестная ситуация`)
    }
    facing = value.facing as Facing
  }
  let vsRaise: VsRaise | undefined
  if (value.vsRaise != null) {
    if (typeof value.vsRaise !== 'string' || !VS_RAISE.has(value.vsRaise as VsRaise)) {
      throw new Error(`${label}: неизвестный ответ на рейз`)
    }
    vsRaise = value.vsRaise as VsRaise
  }
  const hand = definedOnly({
    id: requiredString(value, 'id', label),
    createdAt: requiredNumber(value, 'createdAt', label),
    updatedAt: requiredNumber(value, 'updatedAt', label),
    sessionId: requiredString(value, 'sessionId', label),
    batchId: requiredString(value, 'batchId', label),
    position,
    facing,
    action: action as Action,
    skipped: value.skipped === true ? true : undefined,
    resultBB: optionalNumber(value, 'resultBB', label),
    note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : undefined,
    vsRaise,
  })
  const validation = validateHand(hand)
  if (!validation.ok) throw new Error(`${label}: ${validation.reason}`)
  return hand
}

function normalizeMeta(value: unknown): Meta | undefined {
  if (value == null) return undefined
  if (!isRecord(value) || value.id !== 'app') throw new Error('Блок meta повреждён')
  if (typeof value.reminderAnchor !== 'number' || !Number.isFinite(value.reminderAnchor)) {
    throw new Error('meta.reminderAnchor должен быть числом')
  }
  return definedOnly({
    id: 'app' as const,
    reminderAnchor: value.reminderAnchor,
    lastExportAt: optionalNumber(value, 'lastExportAt', 'meta'),
  })
}

export function parseBundle(raw: unknown): Bundle {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('Нужен JSON PokerTracker версии 1')
  if (!Array.isArray(raw.sessions) || !Array.isArray(raw.hands)) throw new Error('В файле нет сессий или рук')
  return {
    version: 1,
    sessions: raw.sessions.map(normalizeSession),
    hands: raw.hands.map(normalizeHand),
    meta: normalizeMeta(raw.meta),
  }
}

export function mergeMeta(local: Meta, incoming: Meta | undefined): Meta {
  if (!incoming) return local
  const lastExportAt = Math.max(local.lastExportAt ?? 0, incoming.lastExportAt ?? 0)
  return definedOnly({
    id: 'app' as const,
    reminderAnchor: Math.max(local.reminderAnchor, incoming.reminderAnchor),
    lastExportAt: lastExportAt > 0 ? lastExportAt : undefined,
  })
}

export async function readBundle(): Promise<Required<Bundle>> {
  const [sessions, hands, meta] = await Promise.all([
    db.sessions.toArray(),
    db.hands.orderBy('createdAt').toArray(),
    ensureMeta(),
  ])
  return { version: 1, sessions, hands, meta }
}

/**
 * Слияние по id: больший updatedAt побеждает, равный оставляет запись в базе.
 * Рука без сессии в итоге отбрасывается. Заглушка sessionId не создаётся.
 */
export async function importBundle(raw: unknown): Promise<{ sessions: number; hands: number }> {
  const bundle = parseBundle(raw)
  return db.transaction('rw', db.sessions, db.hands, db.meta, async () => {
    const [localSessions, localHands, localMeta] = await Promise.all([
      db.sessions.toArray(),
      db.hands.toArray(),
      ensureMeta(),
    ])
    const sessions = mergeByUpdatedAt(localSessions, bundle.sessions)
    const sessionIds = new Set(sessions.map((session) => session.id))
    const hands = mergeByUpdatedAt(localHands, bundle.hands).filter((hand) => sessionIds.has(hand.sessionId))
    await db.sessions.clear()
    await db.hands.clear()
    if (sessions.length > 0) await db.sessions.bulkAdd(sessions.map((session) => definedOnly(session)))
    if (hands.length > 0) await db.hands.bulkAdd(hands.map((hand) => definedOnly(hand)))
    await db.meta.put(mergeMeta(localMeta, bundle.meta))
    return { sessions: sessions.length, hands: hands.length }
  })
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null || value === '') return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

/** Одна строка на руку. Дата берётся из сессии, не из времени ввода. */
export function handsToCsv(sessions: readonly Session[], hands: readonly Hand[]): string {
  const dates = new Map(sessions.map((session) => [session.id, session.date]))
  const header = [
    'id',
    'сессия',
    'дата',
    'позиция',
    'ситуация',
    'действие',
    'пропуск',
    'ответ на рейз',
    'результат BB',
    'заметка',
    'партия',
    'создано',
    'обновлено',
  ]
  const rows = [...hands]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((hand) => [
      hand.id,
      hand.sessionId,
      dates.get(hand.sessionId) ?? '',
      hand.position,
      hand.facing ?? '',
      hand.action,
      hand.skipped ? 'да' : '',
      hand.vsRaise ?? '',
      hand.resultBB ?? '',
      hand.note ?? '',
      hand.batchId,
      hand.createdAt,
      hand.updatedAt,
    ])
  return [header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n') + '\n'
}
