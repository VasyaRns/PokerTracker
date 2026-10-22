import { useState } from 'react'
import { allowedActions } from '../../domain/actions'
import { formatDisplayDate } from '../../domain/dates'
import { positionsFor } from '../../domain/positions'
import { formatSigned } from '../../domain/results'
import type { Action, Facing, Hand, Position, VsRaise } from '../../domain/types'
import { deleteHand, updateHand } from '../../db/hands'
import { actionLabel, facingLabel, vsRaiseLabel } from '../../app/labels'
import { errorText } from '../../app/files'
import { parseNumber } from '../../app/parse'
import { useLiveQuery } from '../../app/useLiveQuery'
import { Button, Field, controlClass } from '../../app/ui'
import { db } from '../../db/db'

const FACINGS: Facing[] = ['foldedToMe', 'limp', 'raise', 'threeBetPlus']

function HandEditor({ hand, tableSize, onClose }: { hand: Hand; tableSize: number; onClose: () => void }) {
  const circle = positionsFor(tableSize)
  const positions = circle.includes(hand.position) ? circle : [hand.position, ...circle]
  const [position, setPosition] = useState<Position>(hand.position)
  const [facing, setFacing] = useState<Facing | ''>(hand.facing ?? '')
  const [action, setAction] = useState<Action>(hand.action)
  const [skipped, setSkipped] = useState(Boolean(hand.skipped))
  const [note, setNote] = useState(hand.note ?? '')
  const [result, setResult] = useState(hand.resultBB == null ? '' : String(hand.resultBB))
  const [vsRaise, setVsRaise] = useState<VsRaise | ''>(hand.vsRaise ?? '')
  const [error, setError] = useState<string | null>(null)

  const actions = !skipped && facing ? allowedActions(position, facing) : []

  async function save() {
    setError(null)
    try {
      const resultBB = parseNumber(result, 'Результат в BB')
      const attach =
        !skipped &&
        vsRaise &&
        facing &&
        (action === 'call' || action === 'raise') &&
        (facing === 'foldedToMe' || facing === 'limp')
      await updateHand(hand.id, {
        position,
        facing: skipped ? null : facing || null,
        action: skipped ? 'fold' : action,
        skipped,
        note,
        resultBB,
        vsRaise: attach ? vsRaise : undefined,
      })
      onClose()
    } catch (cause: unknown) {
      setError(errorText(cause, 'Не удалось сохранить'))
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-[#345445] pt-3">
      <label className="flex min-h-12 items-center gap-3 text-base">
        <input type="checkbox" checked={skipped} onChange={(event) => setSkipped(event.target.checked)} />
        Пропущенный фолд
      </label>
      <div className="grid grid-cols-3 gap-2">
        {positions.map((item) => (
          <Button
            key={item}
            tone={position === item ? 'gold' : 'neutral'}
            onClick={() => {
              setPosition(item)
              if (!skipped && facing && !allowedActions(item, facing).includes(action)) {
                setAction(allowedActions(item, facing)[0])
              }
            }}
          >
            {item}
          </Button>
        ))}
      </div>
      {!skipped && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {FACINGS.map((item) => (
              <Button
                key={item}
                tone={facing === item ? 'gold' : 'neutral'}
                onClick={() => {
                  setFacing(item)
                  const allowed = allowedActions(position, item)
                  if (!allowed.includes(action)) setAction(allowed[0])
                }}
              >
                {facingLabel[item]}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((item) => (
              <Button key={item} tone={action === item ? 'gold' : 'neutral'} onClick={() => setAction(item)}>
                {actionLabel[item]}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button tone={vsRaise === '' ? 'gold' : 'neutral'} onClick={() => setVsRaise('')}>
              Нет ответа
            </Button>
            {(Object.keys(vsRaiseLabel) as VsRaise[]).map((item) => (
              <Button key={item} tone={vsRaise === item ? 'gold' : 'neutral'} onClick={() => setVsRaise(item)}>
                {vsRaiseLabel[item]}
              </Button>
            ))}
          </div>
        </>
      )}
      <Field label="Результат, BB">
        <input className={controlClass} inputMode="decimal" value={result} onChange={(event) => setResult(event.target.value)} />
      </Field>
      <Field label="Заметка">
        <textarea className={`${controlClass} min-h-24 py-3`} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-[#ffb4a8]">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button tone="gold" onClick={() => void save()}>
          Сохранить
        </Button>
        <Button tone="ghost" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  )
}

export function HandsScreen() {
  const hands = useLiveQuery(() => db.hands.orderBy('createdAt').reverse().toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const [notesOnly, setNotesOnly] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!hands || !sessions) return <p className="text-[#9bb0a6]">Загрузка…</p>

  const visible = notesOnly ? hands.filter((hand) => Boolean(hand.note?.trim())) : hands
  const byId = new Map(sessions.map((session) => [session.id, session]))

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Руки</h1>
        <Button tone={notesOnly ? 'gold' : 'ghost'} aria-pressed={notesOnly} onClick={() => setNotesOnly((value) => !value)}>
          Только с заметками
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-sm text-[#ffb4a8]">
          {error}
        </p>
      )}
      {visible.length === 0 ? (
        <p className="text-[#9bb0a6]">{notesOnly ? 'Нет рук с заметками.' : 'Пока нет рук.'}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((hand) => {
            const session = byId.get(hand.sessionId)
            return (
              <li key={hand.id} className="rounded-2xl bg-[#14211c] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{hand.position}</h2>
                  <span className="text-sm text-[#9bb0a6]">
                    {session ? formatDisplayDate(session.date) : 'Сессия удалена'}
                  </span>
                </div>
                <p>
                  {hand.skipped ? 'Пропущенный фолд' : `${hand.facing ? facingLabel[hand.facing] : '—'} · ${actionLabel[hand.action]}`}
                  {hand.vsRaise ? ` · ответ ${vsRaiseLabel[hand.vsRaise].toLowerCase()}` : ''}
                </p>
                {hand.resultBB != null && <p className="text-sm">{formatSigned(hand.resultBB)} BB</p>}
                {hand.note && <p className="mt-1 text-sm text-[#d5e4db]">{hand.note}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button tone="ghost" onClick={() => setEditing((value) => (value === hand.id ? null : hand.id))}>
                    Изменить
                  </Button>
                  {confirmId === hand.id ? (
                    <Button
                      tone="danger"
                      onClick={() => {
                        void deleteHand(hand.id)
                          .then(() => setConfirmId(null))
                          .catch((cause: unknown) => setError(errorText(cause, 'Не удалось удалить')))
                      }}
                    >
                      Удалить навсегда
                    </Button>
                  ) : (
                    <Button tone="danger" onClick={() => setConfirmId(hand.id)}>
                      Удалить
                    </Button>
                  )}
                </div>
                {confirmId === hand.id && (
                  <Button className="mt-2 w-full" tone="ghost" onClick={() => setConfirmId(null)}>
                    Оставить
                  </Button>
                )}
                {editing === hand.id && (
                  <HandEditor
                    key={`${hand.id}-${hand.updatedAt}`}
                    hand={hand}
                    tableSize={session?.tableSize ?? 9}
                    onClose={() => setEditing(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
