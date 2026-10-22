import { useEffect, useState } from 'react'
import { formatDisplayDate, formatLocalDate } from '../../domain/dates'
import { sessionHeadline } from '../../domain/results'
import type { Format, Session } from '../../domain/types'
import { createSession, endSession, reopenSession, updateSession } from '../../db/sessions'
import { formatLabel } from '../../app/labels'
import { errorText } from '../../app/files'
import { parseNumber } from '../../app/parse'
import { useLiveQuery } from '../../app/useLiveQuery'
import { Button, Field, controlClass } from '../../app/ui'
import { db } from '../../db/db'

const TABLE_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10]

function SessionCard({ session }: { session: Session }) {
  const hands = useLiveQuery(() => db.hands.where('sessionId').equals(session.id).toArray(), [session.id])
  const headline = sessionHeadline(session, hands ?? [])
  const open = session.endedAt == null
  const [error, setError] = useState<string | null>(null)
  const [place, setPlace] = useState(session.place)
  const [note, setNote] = useState(session.note ?? '')
  const [buyIn, setBuyIn] = useState(session.buyIn == null ? '' : String(session.buyIn))
  const [prize, setPrize] = useState(session.prize == null ? '' : String(session.prize))

  useEffect(() => {
    setPlace(session.place)
    setNote(session.note ?? '')
    setBuyIn(session.buyIn == null ? '' : String(session.buyIn))
    setPrize(session.prize == null ? '' : String(session.prize))
  }, [session.id, session.updatedAt, session.place, session.note, session.buyIn, session.prize])

  function save(patch: Parameters<typeof updateSession>[1]) {
    void updateSession(session.id, patch).catch((cause: unknown) => setError(errorText(cause, 'Не удалось сохранить сессию')))
  }

  return (
    <article className="rounded-3xl bg-[#14211c] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{formatDisplayDate(session.date)}</h2>
          <p className="text-sm text-[#9bb0a6]">
            {session.place.trim() || 'Без места'} · {formatLabel[session.format]} · {session.tableSize} мест
          </p>
        </div>
        <span className={`rounded-full px-3 py-2 text-xs ${open ? 'bg-[#1f6b45]' : 'bg-[#1c2e26]'}`}>
          {open ? 'открыта' : 'завершена'}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold">Итог {headline.text}</p>
      {session.format === 'cash' && <p className="text-sm text-[#9bb0a6]">Сумма результата рук в BB.</p>}

      <div className="mt-3 flex flex-col gap-3">
        <Field label="Дата">
          <input
            className={controlClass}
            type="date"
            value={session.date}
            onChange={(event) => {
              if (event.target.value) save({ date: event.target.value })
            }}
          />
        </Field>
        <Field label="Место">
          <input
            className={controlClass}
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            onBlur={() => {
              if (place !== session.place) save({ place })
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {(['cash', 'tournament'] as Format[]).map((format) => (
            <Button key={format} tone={session.format === format ? 'gold' : 'neutral'} onClick={() => save({ format })}>
              {formatLabel[format]}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {TABLE_SIZES.map((size) => (
            <Button key={size} tone={session.tableSize === size ? 'gold' : 'neutral'} onClick={() => save({ tableSize: size })}>
              {size}
            </Button>
          ))}
        </div>
        {session.format === 'tournament' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Бай-ин">
              <input
                className={controlClass}
                inputMode="decimal"
                value={buyIn}
                onChange={(event) => setBuyIn(event.target.value)}
                onBlur={() => {
                  try {
                    const next = parseNumber(buyIn, 'Бай-ин')
                    if (next !== session.buyIn) save({ buyIn: next })
                  } catch (cause: unknown) {
                    setError(errorText(cause, 'Бай-ин — число'))
                  }
                }}
              />
            </Field>
            <Field label="Приз">
              <input
                className={controlClass}
                inputMode="decimal"
                value={prize}
                onChange={(event) => setPrize(event.target.value)}
                onBlur={() => {
                  try {
                    const next = parseNumber(prize, 'Приз')
                    if (next !== session.prize) save({ prize: next })
                  } catch (cause: unknown) {
                    setError(errorText(cause, 'Приз — число'))
                  }
                }}
              />
            </Field>
          </div>
        )}
        <Field label="Заметка">
          <textarea
            className={`${controlClass} min-h-20 py-3`}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              if (note !== (session.note ?? '')) save({ note })
            }}
          />
        </Field>
        {open ? (
          <Button tone="danger" onClick={() => void endSession(session.id).catch((cause: unknown) => setError(errorText(cause, 'Не удалось завершить')))}>
            Завершить
          </Button>
        ) : (
          <Button tone="gold" onClick={() => void reopenSession(session.id).catch((cause: unknown) => setError(errorText(cause, 'Не удалось открыть')))}>
            Открыть снова
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-[#ffb4a8]">
            {error}
          </p>
        )}
      </div>
    </article>
  )
}

export function SessionsScreen() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const [creating, setCreating] = useState(false)
  const [date, setDate] = useState(() => formatLocalDate(Date.now()))
  const [place, setPlace] = useState('')
  const [format, setFormat] = useState<Format>('cash')
  const [tableSize, setTableSize] = useState(9)
  const [buyIn, setBuyIn] = useState('')
  const [prize, setPrize] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!sessions) return <p className="text-[#9bb0a6]">Загрузка…</p>
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)

  async function create() {
    setError(null)
    try {
      await createSession({
        date,
        place,
        format,
        tableSize,
        buyIn: format === 'tournament' ? parseNumber(buyIn, 'Бай-ин') : undefined,
        prize: format === 'tournament' ? parseNumber(prize, 'Приз') : undefined,
      })
      setCreating(false)
      setPlace('')
      setBuyIn('')
      setPrize('')
    } catch (cause: unknown) {
      setError(errorText(cause, 'Не удалось создать сессию'))
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Сессии</h1>
        <Button tone="gold" onClick={() => setCreating((value) => !value)}>
          Новая
        </Button>
      </header>
      {creating && (
        <div className="flex flex-col gap-3 rounded-3xl bg-[#14211c] p-3">
          <Field label="Дата">
            <input className={controlClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Место">
            <input className={controlClass} value={place} onChange={(event) => setPlace(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'tournament'] as Format[]).map((item) => (
              <Button key={item} tone={format === item ? 'gold' : 'neutral'} onClick={() => setFormat(item)}>
                {formatLabel[item]}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {TABLE_SIZES.map((size) => (
              <Button key={size} tone={tableSize === size ? 'gold' : 'neutral'} onClick={() => setTableSize(size)}>
                {size}
              </Button>
            ))}
          </div>
          {format === 'tournament' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Бай-ин">
                <input className={controlClass} inputMode="decimal" value={buyIn} onChange={(event) => setBuyIn(event.target.value)} />
              </Field>
              <Field label="Приз">
                <input className={controlClass} inputMode="decimal" value={prize} onChange={(event) => setPrize(event.target.value)} />
              </Field>
            </div>
          )}
          <Button tone="gold" onClick={() => void create()}>
            Создать
          </Button>
          {error && (
            <p role="alert" className="text-sm text-[#ffb4a8]">
              {error}
            </p>
          )}
        </div>
      )}
      {ordered.length === 0 ? (
        <p className="text-[#9bb0a6]">Сессий пока нет. На вводе откроется сегодняшняя.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </section>
  )
}
