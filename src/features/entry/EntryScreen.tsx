import { useEffect, useRef, useState } from 'react'
import { allowedActions } from '../../domain/actions'
import { formatDisplayDate } from '../../domain/dates'
import { createFoldBatch, hintAfterHands } from '../../domain/hands'
import { positionsFor } from '../../domain/positions'
import type { Action, Facing, Hand, Position, VsRaise } from '../../domain/types'
import { addHands } from '../../db/hands'
import { ensureOpenSession, updateSession } from '../../db/sessions'
import { actionLabel, facingLabel, vsRaiseLabel } from '../../app/labels'
import { errorText } from '../../app/files'
import { parseNumber } from '../../app/parse'
import { offerUndo } from '../../app/undo'
import { useLiveQuery } from '../../app/useLiveQuery'
import { Button, Field, controlClass, type Tone } from '../../app/ui'
import { db } from '../../db/db'

const FACINGS: Facing[] = ['foldedToMe', 'limp', 'raise', 'threeBetPlus']
const TABLE_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const ACTION_TONE: Record<Action, Tone> = {
  fold: 'neutral',
  call: 'blue',
  raise: 'gold',
  check: 'green',
  walk: 'green',
}

function canAttachVs(action: Action, facing: Facing): boolean {
  return (action === 'call' || action === 'raise') && (facing === 'foldedToMe' || facing === 'limp')
}

let lastStamp = 0

function stamp(): number {
  const next = Math.max(Date.now(), lastStamp + 1)
  lastStamp = next
  return next
}

export function EntryScreen() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const hands = useLiveQuery(() => db.hands.toArray(), [])
  const open = sessions?.find((session) => session.endedAt == null)
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<Position | null>(null)
  const [facing, setFacing] = useState<Facing | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [result, setResult] = useState('')
  const [note, setNote] = useState('')
  const [vsRaise, setVsRaise] = useState<VsRaise | ''>('')
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    void ensureOpenSession().catch((cause: unknown) => setError(errorText(cause, 'Не удалось открыть сессию')))
  }, [])

  const sessionHands = open && hands ? hands.filter((hand) => hand.sessionId === open.id) : []
  const hint = open ? hintAfterHands(sessionHands, open.tableSize) : null
  const circle = open ? positionsFor(open.tableSize) : []
  const vsEnabled = facing === 'foldedToMe' || facing === 'limp'

  useEffect(() => {
    if (picked && open && !circle.includes(picked)) {
      setPicked(null)
      setFacing(null)
    }
  }, [circle, open, picked])

  async function commit(action: Action) {
    if (!open || !picked || !facing || busy.current) return
    busy.current = true
    setError(null)
    try {
      const now = stamp()
      const hand: Hand = {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        sessionId: open.id,
        batchId: crypto.randomUUID(),
        position: picked,
        facing,
        action,
      }
      const resultBB = parseNumber(result, 'Результат в BB')
      if (resultBB != null) hand.resultBB = resultBB
      const trimmed = note.trim()
      if (trimmed) hand.note = trimmed
      if (vsRaise && canAttachVs(action, facing)) hand.vsRaise = vsRaise
      await addHands([hand])
      offerUndo({ batchId: hand.batchId, label: 'Рука записана' })
      setPicked(null)
      setFacing(null)
      setResult('')
      setNote('')
      setVsRaise('')
      setDetailsOpen(false)
    } catch (cause: unknown) {
      setError(errorText(cause, 'Не удалось записать руку'))
    } finally {
      busy.current = false
    }
  }

  async function folds(count: 1 | 2 | 3) {
    if (!open || !hint || busy.current) return
    busy.current = true
    setError(null)
    try {
      const now = stamp()
      const batchId = crypto.randomUUID()
      const batch = createFoldBatch({
        position: hint,
        count,
        tableSize: open.tableSize,
        sessionId: open.id,
        now,
        batchId,
        ids: Array.from({ length: count }, () => crypto.randomUUID()),
      })
      await addHands(batch.hands)
      offerUndo({ batchId, label: count === 1 ? '+1 фолд записан' : `+${count} записаны` })
      setPicked(null)
      setFacing(null)
    } catch (cause: unknown) {
      setError(errorText(cause, 'Не удалось записать фолды'))
    } finally {
      busy.current = false
    }
  }

  if (!sessions || !hands) return <p className="text-[#9bb0a6]">Загрузка…</p>
  if (!open || !hint) return <p className="text-[#9bb0a6]">Открываю сессию…</p>

  const step = picked == null ? 'Шаг 1 из 3 · позиция' : facing == null ? 'Шаг 2 из 3 · ситуация' : 'Шаг 3 из 3 · действие'
  const actions = facing ? allowedActions(picked ?? hint, facing) : []

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Ввод</h1>
        <p className="text-sm text-[#9bb0a6]">Три тапа: позиция, ситуация, действие.</p>
      </header>

      <div>
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-[#14211c] px-3 text-left ring-1 ring-[#345445]"
          aria-expanded={editing}
          onClick={() => setEditing((value) => !value)}
        >
          <span className="font-semibold">{open.tableSize} мест</span>
          <span>{formatDisplayDate(open.date)}</span>
        </button>
        {editing && (
          <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-[#14211c] p-3">
            <div>
              <p className="mb-2 text-sm text-[#9bb0a6]">Размер стола</p>
              <div className="grid grid-cols-5 gap-2">
                {TABLE_SIZES.map((size) => (
                  <Button
                    key={size}
                    selected={open.tableSize === size}
                    tone={open.tableSize === size ? 'gold' : 'neutral'}
                    onClick={() => {
                      void updateSession(open.id, { tableSize: size }).catch((cause: unknown) =>
                        setError(errorText(cause, 'Не удалось сменить стол')),
                      )
                    }}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <Field label="Дата игры">
              <input
                className={controlClass}
                type="date"
                value={open.date}
                onChange={(event) => {
                  const date = event.target.value
                  if (!date) return
                  void updateSession(open.id, { date }).catch((cause: unknown) =>
                    setError(errorText(cause, 'Не удалось сменить дату')),
                  )
                }}
              />
            </Field>
          </div>
        )}
      </div>

      <p className="text-sm text-[#9bb0a6]">{step}</p>
      <p className="text-sm">
        Подсказка: <span className="font-semibold text-[#e4c36a]">{hint}</span>
      </p>

      <div className="grid grid-cols-3 gap-2">
        {circle.map((position) => {
          const selected = picked === position
          const hinted = picked == null && position === hint
          return (
            <Button
              key={position}
              tone={selected ? 'gold' : 'neutral'}
              selected={selected || hinted}
              aria-pressed={selected}
              aria-label={position === hint ? `${position}, подсказка` : position}
              onClick={() => {
                setPicked(position)
                setFacing(null)
              }}
            >
              {position}
            </Button>
          )
        })}
      </div>

      {picked && (
        <div className="grid grid-cols-2 gap-2">
          {FACINGS.map((item) => (
            <Button
              key={item}
              tone={facing === item ? 'gold' : 'neutral'}
              aria-pressed={facing === item}
              onClick={() => setFacing(item)}
            >
              {facingLabel[item]}
            </Button>
          ))}
        </div>
      )}

      <Button tone="ghost" aria-expanded={detailsOpen} aria-controls="hand-details" onClick={() => setDetailsOpen((value) => !value)}>
        Подробнее
      </Button>
      {detailsOpen && (
        <div id="hand-details" className="flex flex-col gap-3 rounded-2xl bg-[#14211c] p-3">
          <Field label="Результат, BB">
            <input
              className={controlClass}
              inputMode="decimal"
              autoComplete="off"
              value={result}
              onChange={(event) => setResult(event.target.value)}
            />
          </Field>
          <Field label="Заметка">
            <textarea className={`${controlClass} min-h-24 py-3`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div>
            <p className="mb-2 text-sm text-[#9bb0a6]">Ответ на рейз</p>
            <div className="grid grid-cols-2 gap-2">
              <Button tone={vsRaise === '' ? 'gold' : 'neutral'} disabled={!vsEnabled} onClick={() => setVsRaise('')}>
                Нет
              </Button>
              {(Object.keys(vsRaiseLabel) as VsRaise[]).map((item) => (
                <Button
                  key={item}
                  tone={vsRaise === item ? 'gold' : 'neutral'}
                  disabled={!vsEnabled}
                  onClick={() => setVsRaise(item)}
                >
                  {vsRaiseLabel[item]}
                </Button>
              ))}
            </div>
            {!vsEnabled && <p className="mt-2 text-sm text-[#9bb0a6]">Для колла или рейза, если до вас фолд или лимп.</p>}
          </div>
        </div>
      )}

      {picked && facing && (
        <div className="grid grid-cols-1 gap-2">
          {actions.map((action) => (
            <Button key={action} tone={ACTION_TONE[action]} className="min-h-14" data-action={action} onClick={() => void commit(action)}>
              {actionLabel[action]}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => void folds(1)}>+1 фолд</Button>
        <Button aria-label="+2 фолда" onClick={() => void folds(2)}>
          +2
        </Button>
        <Button aria-label="+3 фолда" onClick={() => void folds(3)}>
          +3
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#ffb4a8]">
          {error}
        </p>
      )}
    </section>
  )
}
