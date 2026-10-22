import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatLocalDate } from '../domain/dates'
import type { Hand, Session } from '../domain/types'
import { definedOnly } from './clean'
import { db } from './db'
import { addHands, listHandsBySession, listHandsInPeriod, updateHand } from './hands'
import { countEnded, dismissExportReminder, markExported, shouldRemindExport } from './persist'
import { createSession, endSession, ensureOpenSession, getOpenSession, reopenSession } from './sessions'
import { handsToCsv, importBundle, readBundle } from './transfer'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function session(partial: Partial<Session> & Pick<Session, 'id' | 'date'>): Session {
  return definedOnly({
    id: partial.id,
    startedAt: partial.startedAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    date: partial.date,
    place: partial.place ?? '',
    format: partial.format ?? 'cash',
    tableSize: partial.tableSize ?? 9,
    note: partial.note,
    endedAt: partial.endedAt,
    buyIn: partial.buyIn,
    prize: partial.prize,
  })
}

function hand(partial: Partial<Hand> & Pick<Hand, 'id' | 'sessionId' | 'position' | 'action'>): Hand {
  return definedOnly({
    id: partial.id,
    createdAt: partial.createdAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    sessionId: partial.sessionId,
    batchId: partial.batchId ?? `batch-${partial.id}`,
    position: partial.position,
    facing: partial.facing === undefined ? 'foldedToMe' : partial.facing,
    action: partial.action,
    skipped: partial.skipped,
    resultBB: partial.resultBB,
    note: partial.note,
    vsRaise: partial.vsRaise,
  })
}

describe('схема Dexie', () => {
  it('версия 1, без индекса endedAt и без заглушки sessionId', () => {
    expect(db.name).toBe('pokertracker')
    expect(db.verno).toBe(1)
    const sessionIndexes = db.sessions.schema.indexes.map((index) => index.name).sort()
    expect(sessionIndexes).toEqual(['date', 'startedAt'])
    expect(JSON.stringify(db.sessions.schema)).not.toContain('endedAt')
    const handSources = db.hands.schema.indexes.map((index) => index.src).sort()
    expect(handSources).toEqual(['[sessionId+createdAt]', 'createdAt', 'sessionId'])
  })
})

describe('сессии', () => {
  it('открытая сессия — та, у которой нет endedAt', async () => {
    await db.sessions.bulkAdd([
      session({ id: 'closed', date: '2026-04-01', endedAt: 50 }),
      session({ id: 'open', date: '2026-04-02' }),
    ])
    const open = await getOpenSession()
    expect(open?.id).toBe('open')
    expect(open?.endedAt).toBeUndefined()
  })

  it('если открытой нет, создаётся кэш на 9 мест с локальной датой', async () => {
    const now = Date.UTC(2026, 5, 2, 12, 0, 0)
    const created = await ensureOpenSession(now)
    expect(created).toMatchObject({
      format: 'cash',
      tableSize: 9,
      place: '',
      date: formatLocalDate(now),
    })
    expect(created.endedAt).toBeUndefined()
    expect(created.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const again = await ensureOpenSession(now + 86_400_000)
    expect(again.id).toBe(created.id)
  })

  it('открытая сессия одна: создание и повторное открытие завершают прежнюю', async () => {
    const first = await ensureOpenSession(1_000)
    const second = await createSession(
      { date: '2026-04-03', place: 'клуб', format: 'tournament', tableSize: 6, buyIn: 200, prize: 0 },
      2_000,
    )
    expect((await db.sessions.get(first.id))?.endedAt).toBe(2_000)
    expect((await getOpenSession())?.id).toBe(second.id)

    await endSession(second.id, 3_000)
    expect(await getOpenSession()).toBeUndefined()

    await reopenSession(first.id, 4_000)
    const reopened = await db.sessions.get(first.id)
    expect(reopened?.endedAt).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(reopened, 'endedAt')).toBe(false)
    expect((await db.sessions.get(second.id))?.endedAt).toBe(3_000)
    expect((await getOpenSession())?.id).toBe(first.id)
  })
})

describe('руки', () => {
  it('sessionId всегда id существующей сессии', async () => {
    const open = await ensureOpenSession(1_000)
    await expect(
      addHands([hand({ id: 'orphan', sessionId: 'none', position: 'UTG', action: 'fold' })]),
    ).rejects.toThrow(/несуществующую сессию/)
    expect(await db.hands.count()).toBe(0)

    await addHands([
      hand({ id: 'a', sessionId: open.id, position: 'UTG', action: 'fold', createdAt: 2 }),
      hand({ id: 'b', sessionId: open.id, position: 'BB', facing: 'foldedToMe', action: 'walk', createdAt: 3 }),
    ])
    const listed = await listHandsBySession(open.id)
    expect(listed.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('не пишет невалидную комбинацию и позицию вне круга', async () => {
    const open = await createSession({ date: '2026-04-01', place: '', format: 'cash', tableSize: 6 }, 1_000)
    await expect(
      addHands([hand({ id: 'bad', sessionId: open.id, position: 'BB', facing: 'limp', action: 'fold' })]),
    ).rejects.toThrow(/нельзя/)
    await expect(
      addHands([hand({ id: 'wide', sessionId: open.id, position: 'UTG+1', action: 'fold' })]),
    ).rejects.toThrow(/круг/)
    expect(await db.hands.count()).toBe(0)
  })

  it('правка меняет updatedAt', async () => {
    const open = await ensureOpenSession(1_000)
    await addHands([hand({ id: 'note', sessionId: open.id, position: 'CO', action: 'raise', updatedAt: 5 })])
    const saved = await updateHand('note', { note: 'тилт' }, 80)
    expect(saved.updatedAt).toBe(80)
    expect(saved.createdAt).toBe(1)
    expect((await db.hands.get('note'))?.note).toBe('тилт')
  })

  it('период фильтрует по session.date, рука со следующими сутками UTC остаётся', async () => {
    await db.sessions.bulkAdd([
      session({ id: 'day1', date: '2026-03-01' }),
      session({ id: 'day2', date: '2026-03-02' }),
      session({ id: 'day3', date: '2026-03-03' }),
    ])
    await addHands([
      hand({
        id: 'late',
        sessionId: 'day1',
        position: 'UTG',
        action: 'fold',
        createdAt: Date.parse('2026-03-02T00:30:00Z'),
      }),
      hand({
        id: 'early',
        sessionId: 'day2',
        position: 'HJ',
        action: 'call',
        createdAt: Date.parse('2026-03-01T12:00:00Z'),
      }),
      hand({
        id: 'third',
        sessionId: 'day3',
        position: 'BTN',
        action: 'raise',
        createdAt: Date.parse('2026-03-03T12:00:00Z'),
      }),
    ])

    expect((await listHandsInPeriod('2026-03-01', '2026-03-02')).map((item) => item.id).sort()).toEqual([
      'early',
      'late',
    ])
    expect((await listHandsInPeriod('2026-03-01', '2026-03-01')).map((item) => item.id)).toEqual(['late'])
    expect((await listHandsInPeriod('2026-03-03', '2026-03-03')).map((item) => item.id)).toEqual(['third'])
  })
})

describe('импорт и напоминание', () => {
  it('равный updatedAt не затирает базу, больший побеждает, рука без сессии не остаётся', async () => {
    await db.sessions.bulkAdd([session({ id: 's', date: '2026-04-01', updatedAt: 10, place: 'дом' })])
    await addHands([
      hand({
        id: 'h',
        sessionId: 's',
        position: 'CO',
        action: 'raise',
        updatedAt: 10,
        note: 'локальная',
      }),
    ])

    const equal = await importBundle({
      version: 1,
      sessions: [session({ id: 's', date: '2026-04-01', updatedAt: 10, place: 'чужое' })],
      hands: [
        hand({ id: 'h', sessionId: 's', position: 'CO', action: 'raise', updatedAt: 10, note: 'чужая' }),
        hand({ id: 'orphan', sessionId: 'none', position: 'UTG', action: 'fold', updatedAt: 99 }),
      ],
      meta: { id: 'app', reminderAnchor: 0 },
    })
    expect(equal.hands).toBe(1)
    expect((await db.hands.get('h'))?.note).toBe('локальная')
    expect((await db.sessions.get('s'))?.place).toBe('дом')
    expect(await db.hands.get('orphan')).toBeUndefined()
    expect(await db.sessions.get('none')).toBeUndefined()

    await importBundle({
      version: 1,
      sessions: [session({ id: 's', date: '2026-04-02', updatedAt: 11, place: 'клуб' })],
      hands: [hand({ id: 'h', sessionId: 's', position: 'BTN', action: 'call', updatedAt: 12, note: 'новее' })],
    })
    expect((await db.sessions.get('s'))?.place).toBe('клуб')
    expect((await db.hands.get('h'))?.note).toBe('новее')
    expect((await db.hands.get('h'))?.position).toBe('BTN')
  })

  it('csv — одна строка на руку', async () => {
    const bundle = {
      sessions: [session({ id: 's', date: '2026-04-01' })],
      hands: [
        hand({ id: 'h1', sessionId: 's', position: 'CO', action: 'raise', note: 'запятая, и "кавычка"' }),
        hand({ id: 'h2', sessionId: 's', position: 'BB', facing: 'foldedToMe', action: 'walk' }),
      ],
    }
    const csv = handsToCsv(bundle.sessions, bundle.hands)
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(1 + bundle.hands.length)
    expect(lines[0]).toContain('дата')
    expect(csv).toContain('2026-04-01')
    expect(csv).toContain('"запятая, и ""кавычка"""')
  })

  it('напоминание после каждых 5 завершённых сессий, экспорт и скрытие двигают якорь', async () => {
    await ensureOpenSession(1)
    for (let index = 0; index < 5; index += 1) {
      await createSession(
        { date: `2026-05-${String(index + 1).padStart(2, '0')}`, place: '', format: 'cash', tableSize: 9 },
        10 + index,
      )
    }
    const ended = countEnded(await db.sessions.toArray())
    expect(ended).toBe(5)
    expect(shouldRemindExport(ended, 0)).toBe(true)
    expect(shouldRemindExport(4, 0)).toBe(false)

    await dismissExportReminder()
    const hidden = await db.meta.get('app')
    expect(hidden?.reminderAnchor).toBe(5)
    expect(shouldRemindExport(ended, hidden?.reminderAnchor ?? 0)).toBe(false)

    for (let index = 0; index < 5; index += 1) {
      await createSession(
        { date: `2026-06-${String(index + 1).padStart(2, '0')}`, place: '', format: 'cash', tableSize: 9 },
        20 + index,
      )
    }
    const later = countEnded(await db.sessions.toArray())
    expect(later).toBe(10)
    expect(shouldRemindExport(later, 5)).toBe(true)

    await markExported(500)
    const exported = await db.meta.get('app')
    expect(exported?.reminderAnchor).toBe(10)
    expect(exported?.lastExportAt).toBe(500)
    expect(shouldRemindExport(later, exported?.reminderAnchor ?? 0)).toBe(false)

    const roundTrip = await readBundle()
    expect(roundTrip.version).toBe(1)
    expect(roundTrip.sessions.length).toBe(later + 1)
  })
})
