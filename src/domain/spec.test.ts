import { describe, expect, it } from 'vitest'
import { allowedActions } from './actions'
import { filterHandsBySessionDate, formatLocalDate } from './dates'
import { createFoldBatch, hintAfterHands, undoBatch } from './hands'
import { mergeByUpdatedAt } from './merge'
import { earliestPosition, nextPosition, positionsFor } from './positions'
import { sessionHeadline } from './results'
import { computeStats } from './stats'
import type { Hand, Position, Session } from './types'
import { validateHand } from './validate'

let sequence = 0

function make(partial: Partial<Hand> & Pick<Hand, 'position' | 'action'>): Hand {
  sequence += 1
  return {
    id: partial.id ?? `h${sequence}`,
    createdAt: partial.createdAt ?? sequence,
    updatedAt: partial.updatedAt ?? sequence,
    sessionId: partial.sessionId ?? 'session-1',
    batchId: partial.batchId ?? `batch-${sequence}`,
    position: partial.position,
    facing: partial.facing === undefined ? 'foldedToMe' : partial.facing,
    action: partial.action,
    skipped: partial.skipped,
    resultBB: partial.resultBB,
    note: partial.note,
    vsRaise: partial.vsRaise,
  }
}

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

describe('статы', () => {
  it('лимп, потом рейз хиро: VPIP и PFR есть, возможностей ATS и 3-bet нет', () => {
    const stats = computeStats([make({ position: 'HJ', facing: 'limp', action: 'raise' })])
    expect(stats.vpip.hits).toBe(1)
    expect(stats.vpip.opportunities).toBe(1)
    expect(stats.pfr.hits).toBe(1)
    expect(stats.pfr.opportunities).toBe(1)
    expect(stats.ats.opportunities).toBe(0)
    expect(stats.threeBet.opportunities).toBe(0)
  })

  it('открытый лимп с CO: VPIP есть, PFR нет, в знаменателе ATS есть, в числителе нет', () => {
    const stats = computeStats([
      make({ position: 'CO', facing: 'foldedToMe', action: 'call' }),
      make({ position: 'HJ', facing: 'foldedToMe', action: 'call' }),
    ])
    expect(stats.vpip.hits).toBe(2)
    expect(stats.pfr.hits).toBe(0)
    expect(stats.pfr.opportunities).toBe(2)
    expect(stats.ats.hits).toBe(0)
    expect(stats.ats.opportunities).toBe(1)
  })

  it('чек BB на лимпе: знаменатель VPIP есть, числитель нет, фолд validate не принимает', () => {
    const check = make({ position: 'BB', facing: 'limp', action: 'check' })
    const stats = computeStats([check])
    expect(stats.vpip.opportunities).toBe(1)
    expect(stats.vpip.hits).toBe(0)
    expect(stats.pfr.hits).toBe(0)
    expect(validateHand(check).ok).toBe(true)
    expect(validateHand({ ...check, action: 'fold' }).ok).toBe(false)
    expect(allowedActions('BB', 'limp')).toEqual(['check', 'raise'])
  })

  it('SB против лимпов: колл, рейз, фолд; добор при foldedToMe — call и это VPIP', () => {
    const limpCall = make({ position: 'SB', facing: 'limp', action: 'call' })
    const limpRaise = make({ position: 'SB', facing: 'limp', action: 'raise' })
    const limpFold = make({ position: 'SB', facing: 'limp', action: 'fold' })
    const complete = make({ position: 'SB', facing: 'foldedToMe', action: 'call' })
    const stats = computeStats([limpCall, limpRaise, limpFold, complete])

    expect(computeStats([limpCall]).vpip.hits).toBe(1)
    expect(computeStats([limpRaise]).vpip.hits).toBe(1)
    expect(computeStats([limpRaise]).pfr.hits).toBe(1)
    expect(computeStats([limpFold]).vpip.hits).toBe(0)
    expect(computeStats([limpFold]).vpip.opportunities).toBe(1)
    expect(computeStats([complete]).vpip.hits).toBe(1)
    expect(computeStats([complete]).pfr.hits).toBe(0)
    expect(computeStats([complete]).ats.opportunities).toBe(1)
    expect(computeStats([complete]).ats.hits).toBe(0)

    expect(stats.vpip.hits).toBe(3)
    expect(stats.vpip.opportunities).toBe(4)
    expect(stats.pfr.hits).toBe(1)
    expect(stats.ats.hits).toBe(0)
    expect(stats.ats.opportunities).toBe(1)
    expect(stats.threeBet.opportunities).toBe(0)
  })

  it('3-бет с SB и с BB', () => {
    const stats = computeStats([
      make({ position: 'SB', facing: 'raise', action: 'raise' }),
      make({ position: 'BB', facing: 'raise', action: 'raise' }),
      make({ position: 'CO', facing: 'raise', action: 'fold' }),
    ])
    expect(stats.threeBet.hits).toBe(2)
    expect(stats.threeBet.opportunities).toBe(3)
    expect(stats.vpip.hits).toBe(2)
    expect(stats.pfr.hits).toBe(2)
  })

  it('walk BB не входит ни в один знаменатель и сдвигает круг на одну позицию', () => {
    const walk = make({ position: 'BB', facing: 'foldedToMe', action: 'walk' })
    const stats = computeStats([walk])
    expect(stats.vpip.opportunities).toBe(0)
    expect(stats.pfr.opportunities).toBe(0)
    expect(stats.threeBet.opportunities).toBe(0)
    expect(stats.ats.opportunities).toBe(0)
    expect(stats.foldTo3bet.opportunities).toBe(0)
    expect(validateHand(walk).ok).toBe(true)
    expect(nextPosition('BB', 9)).toBe('SB')
    expect(hintAfterHands([walk], 9)).toBe('SB')
  })

  it('ноль возможностей — «0 из 0», меньше 100 — ненадёжно', () => {
    const empty = computeStats([])
    expect(empty.vpip.ratioText).toBe('0 из 0')
    expect(empty.vpip.percentText).toBeNull()
    expect(empty.vpip.unreliable).toBe(true)

    const ninetyNine = Array.from({ length: 99 }, (_, index) =>
      make({ id: `n${index}`, position: 'UTG', facing: 'foldedToMe', action: 'fold' }),
    )
    expect(computeStats(ninetyNine).vpip.unreliable).toBe(true)
    const hundred = [
      ...ninetyNine,
      make({ id: 'n100', position: 'UTG', facing: 'foldedToMe', action: 'fold' }),
    ]
    expect(computeStats(hundred).vpip.opportunities).toBe(100)
    expect(computeStats(hundred).vpip.unreliable).toBe(false)
  })

  it('лимп/фолд не входит в fold to 3-bet, открытие с ответом входит', () => {
    const stats = computeStats([
      make({ position: 'CO', facing: 'foldedToMe', action: 'raise', vsRaise: 'fold' }),
      make({ position: 'CO', facing: 'limp', action: 'raise', vsRaise: 'call' }),
      make({ position: 'BTN', facing: 'foldedToMe', action: 'call', vsRaise: 'fold' }),
      make({ position: 'BTN', facing: 'foldedToMe', action: 'raise' }),
    ])
    expect(stats.foldTo3bet.hits).toBe(1)
    expect(stats.foldTo3bet.opportunities).toBe(2)
    expect(validateHand(make({ position: 'CO', facing: 'foldedToMe', action: 'call', vsRaise: 'fold' })).ok).toBe(true)
  })
})

describe('пачка фолдов и круг', () => {
  it('+3 фолда с UTG на 9-max: три руки, VPIP +3, 3-bet и ATS не меняются, undo возвращает подсказку', () => {
    const prior = [
      make({ id: 'steal', position: 'CO', facing: 'foldedToMe', action: 'raise', createdAt: 10 }),
      make({ id: 'three', position: 'SB', facing: 'raise', action: 'raise', createdAt: 11 }),
    ]
    const before = computeStats(prior)
    const batch = createFoldBatch({
      position: 'UTG',
      count: 3,
      tableSize: 9,
      sessionId: 'session-1',
      now: 100,
      batchId: 'batch-folds',
      ids: ['f1', 'f2', 'f3'],
    })

    expect(batch.hands).toHaveLength(3)
    expect(batch.hands.map((hand) => hand.position)).toEqual(['UTG', 'BB', 'SB'])
    expect(batch.hands.every((hand) => hand.skipped && hand.action === 'fold' && hand.facing === null)).toBe(true)
    expect(new Set(batch.hands.map((hand) => hand.batchId))).toEqual(new Set(['batch-folds']))
    expect(batch.nextHint).toBe('BTN')

    const combined = [...prior, ...batch.hands]
    const after = computeStats(combined)
    expect(after.vpip.opportunities).toBe(before.vpip.opportunities + 3)
    expect(after.vpip.hits).toBe(before.vpip.hits)
    expect(after.pfr.opportunities).toBe(before.pfr.opportunities + 3)
    expect(after.pfr.hits).toBe(before.pfr.hits)
    expect(after.threeBet).toEqual(before.threeBet)
    expect(after.ats).toEqual(before.ats)
    expect(hintAfterHands(combined, 9)).toBe('BTN')

    const fresh = hintAfterHands(batch.hands, 9)
    expect(fresh).toBe('BTN')
    const undone = undoBatch(batch.hands, 'batch-folds')
    expect(undone).toEqual([])
    expect(hintAfterHands(undone, 9)).toBe('UTG')

    const restored = undoBatch(combined, 'batch-folds')
    expect(restored.map((hand) => hand.id)).toEqual(['steal', 'three'])
    expect(hintAfterHands(restored, 9)).toBe(hintAfterHands(prior, 9))
  })

  it('на 6 и на 9 длина круга равна tableSize, после полного круга позиция та же', () => {
    for (const tableSize of [6, 9] as const) {
      const circle = positionsFor(tableSize)
      expect(circle).toHaveLength(tableSize)
      expect(circle).toEqual(CIRCLES[tableSize])
      let position = earliestPosition(tableSize)
      for (let step = 0; step < tableSize; step += 1) position = nextPosition(position, tableSize)
      expect(position).toBe(earliestPosition(tableSize))
    }
    expect(nextPosition('UTG', 9)).toBe('BB')
    expect(positionsFor(9)).not.toContain('UTG+2')
    expect(positionsFor(10)).toContain('UTG+2')
    for (const tableSize of [2, 3, 4, 5, 7, 8, 10]) {
      expect(positionsFor(tableSize)).toEqual(CIRCLES[tableSize])
    }
  })

  it('смена tableSize, если последней позиции в новом круге нет', () => {
    const hj = [make({ position: 'HJ', action: 'fold', createdAt: 1 })]
    expect(positionsFor(5)).not.toContain('HJ')
    expect(hintAfterHands(hj, 5)).toBe(earliestPosition(5))
    expect(hintAfterHands(hj, 6)).toBe('UTG')

    const button = [make({ position: 'BTN', action: 'fold', createdAt: 2 })]
    expect(hintAfterHands(button, 3)).toBe('BB')
    expect(earliestPosition(3)).toBe('BTN')
  })
})

describe('vsRaise', () => {
  it('разрешён на открытии и на лимпе', () => {
    expect(validateHand(make({ position: 'CO', facing: 'foldedToMe', action: 'raise', vsRaise: 'fold' })).ok).toBe(true)
    expect(validateHand(make({ position: 'BTN', facing: 'foldedToMe', action: 'call', vsRaise: 'raise' })).ok).toBe(true)
    expect(validateHand(make({ position: 'HJ', facing: 'limp', action: 'raise', vsRaise: 'call' })).ok).toBe(true)
    expect(validateHand(make({ position: 'SB', facing: 'limp', action: 'call', vsRaise: 'fold' })).ok).toBe(true)
  })

  it('запрещён на фолде, чеке, walk, skipped, на 3-бете и на threeBetPlus', () => {
    expect(validateHand(make({ position: 'CO', facing: 'foldedToMe', action: 'fold', vsRaise: 'fold' })).ok).toBe(false)
    expect(validateHand(make({ position: 'BB', facing: 'limp', action: 'check', vsRaise: 'fold' })).ok).toBe(false)
    expect(validateHand(make({ position: 'BB', facing: 'foldedToMe', action: 'walk', vsRaise: 'call' })).ok).toBe(false)
    expect(
      validateHand(make({ position: 'UTG', facing: null, action: 'fold', skipped: true, vsRaise: 'fold' })).ok,
    ).toBe(false)
    expect(validateHand(make({ position: 'SB', facing: 'raise', action: 'raise', vsRaise: 'fold' })).ok).toBe(false)
    expect(validateHand(make({ position: 'CO', facing: 'threeBetPlus', action: 'call', vsRaise: 'raise' })).ok).toBe(
      false,
    )
  })
})

describe('период и локальная дата', () => {
  it('период по session.date: рука со следующим сутками UTC остаётся в дне сессии, границы включительны', () => {
    const sessions = [
      { id: 'day1', date: '2026-03-01' },
      { id: 'day2', date: '2026-03-02' },
      { id: 'day3', date: '2026-03-03' },
    ]
    const hands = [
      { id: 'late', sessionId: 'day1', createdAt: Date.parse('2026-03-02T00:30:00Z') },
      { id: 'early', sessionId: 'day2', createdAt: Date.parse('2026-03-01T23:00:00Z') },
      { id: 'third', sessionId: 'day3', createdAt: Date.parse('2026-03-03T12:00:00Z') },
    ]

    expect(filterHandsBySessionDate(sessions, hands, '2026-03-01', '2026-03-02').map((hand) => hand.id)).toEqual([
      'late',
      'early',
    ])
    expect(filterHandsBySessionDate(sessions, hands, '2026-03-01', '2026-03-01').map((hand) => hand.id)).toEqual([
      'late',
    ])
    expect(filterHandsBySessionDate(sessions, hands, '2026-03-03', '2026-03-03').map((hand) => hand.id)).toEqual([
      'third',
    ])
    expect(hands[0].createdAt).toBeGreaterThan(Date.parse('2026-03-02T00:00:00Z'))
  })

  it('formatLocalDate: полночь UTC в America/Los_Angeles и Europe/Moscow даёт разные календарные дни', () => {
    const midnight = Date.UTC(2026, 0, 15, 0, 0, 0)
    const losAngeles = formatLocalDate(midnight, 'America/Los_Angeles')
    const moscow = formatLocalDate(midnight, 'Europe/Moscow')
    expect(losAngeles).toBe('2026-01-14')
    expect(moscow).toBe('2026-01-15')
    expect(losAngeles).not.toBe(moscow)
    expect(new Date(midnight).toISOString().slice(0, 10)).toBe('2026-01-15')
  })
})

describe('импорт', () => {
  it('больший updatedAt побеждает, равный не затирает локальную запись', () => {
    const local = [
      { id: 'a', updatedAt: 5, note: 'local' },
      { id: 'b', updatedAt: 5, note: 'keep' },
    ]
    const incoming = [
      { id: 'a', updatedAt: 6, note: 'newer' },
      { id: 'b', updatedAt: 5, note: 'ignored' },
      { id: 'c', updatedAt: 1, note: 'added' },
    ]
    const merged = mergeByUpdatedAt(local, incoming)
    expect(merged.find((item) => item.id === 'a')).toMatchObject({ note: 'newer', updatedAt: 6 })
    expect(merged.find((item) => item.id === 'b')).toMatchObject({ note: 'keep', updatedAt: 5 })
    expect(merged.find((item) => item.id === 'c')).toMatchObject({ note: 'added' })

    const older = mergeByUpdatedAt(local, [{ id: 'a', updatedAt: 4, note: 'old' }])
    expect(older.find((item) => item.id === 'a')).toMatchObject({ note: 'local' })
  })
})

describe('итог сессии', () => {
  it('турнир не показывает сумму BB заголовком', () => {
    const cash: Session = {
      id: 'cash',
      startedAt: 1,
      updatedAt: 1,
      date: '2026-04-01',
      place: '',
      format: 'cash',
      tableSize: 6,
    }
    const tournament: Session = { ...cash, id: 'tourney', format: 'tournament', buyIn: 100, prize: 250 }
    const hands = [
      make({ sessionId: 'cash', position: 'BTN', action: 'raise', resultBB: 4 }),
      make({ sessionId: 'tourney', position: 'BTN', action: 'raise', resultBB: 99 }),
    ]
    expect(sessionHeadline(cash, hands)).toEqual({ showBb: true, text: '+4 BB' })
    const headline = sessionHeadline(tournament, hands)
    expect(headline.showBb).toBe(false)
    expect(headline.text).not.toContain('BB')
    expect(headline.text).toBe('+150')
  })
})
