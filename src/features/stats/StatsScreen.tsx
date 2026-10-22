import { useState } from 'react'
import { addCalendarDays, filterHandsBySessionDate, formatDisplayDate, formatLocalDate } from '../../domain/dates'
import { computeStats, statsByPosition, type StatLine, type Stats } from '../../domain/stats'
import { statLabels, formatLabel } from '../../app/labels'
import { useLiveQuery } from '../../app/useLiveQuery'
import { Button, controlClass } from '../../app/ui'
import { db } from '../../db/db'

type Period = 'all' | 'today' | '7' | '30' | 'custom'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'today', label: 'Сегодня' },
  { id: '7', label: '7 дней' },
  { id: '30', label: '30 дней' },
  { id: 'custom', label: 'Свой период' },
]

function StatBlock({ label, stat, dash = false }: { label: string; stat: StatLine; dash?: boolean }) {
  return (
    <article className="rounded-2xl bg-[#14211c] p-3">
      <h3 className="text-sm text-[#9bb0a6]">{label}</h3>
      {dash ? (
        <p className="mt-1 text-2xl font-semibold">—</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold">{stat.percentText ?? stat.ratioText}</p>
          {stat.percentText && <p className="text-sm text-[#d5e4db]">{stat.ratioText}</p>}
          {stat.unreliable && <p className="text-xs text-[#e4c36a]">ненадёжно</p>}
        </>
      )}
    </article>
  )
}

function statOf(stats: Stats, key: (typeof statLabels)[number][0]): StatLine {
  return stats[key]
}

export function StatsScreen() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const hands = useLiveQuery(() => db.hands.toArray(), [])
  const [sessionId, setSessionId] = useState('all')
  const [period, setPeriod] = useState<Period>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  if (!sessions || !hands) return <p className="text-[#9bb0a6]">Загрузка…</p>

  const today = formatLocalDate(Date.now())
  const range =
    period === 'today'
      ? { from: today, to: today }
      : period === '7'
        ? { from: addCalendarDays(today, -6), to: today }
        : period === '30'
          ? { from: addCalendarDays(today, -29), to: today }
          : period === 'custom'
            ? { from: from || undefined, to: to || undefined }
            : {}
  const inPeriod = filterHandsBySessionDate(sessions, hands, range.from, range.to)
  const filtered = sessionId === 'all' ? inPeriod : inPeriod.filter((hand) => hand.sessionId === sessionId)
  const stats = computeStats(filtered)
  const rows = statsByPosition(filtered)
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Статистика</h1>
        <p className="text-sm text-[#9bb0a6]">По дате сессии, не по времени ввода.</p>
      </header>

      <label className="flex flex-col gap-1 text-sm text-[#9bb0a6]">
        Сессия
        <select className={controlClass} value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
          <option value="all">Все сессии</option>
          {ordered.map((session) => (
            <option key={session.id} value={session.id}>
              {formatDisplayDate(session.date)} · {formatLabel[session.format]}
              {session.place.trim() ? ` · ${session.place.trim()}` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((item) => (
          <Button
            key={item.id}
            tone={period === item.id ? 'gold' : 'neutral'}
            aria-pressed={period === item.id}
            onClick={() => setPeriod(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm text-[#9bb0a6]">
            С
            <input className={controlClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[#9bb0a6]">
            По
            <input className={controlClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-[#9bb0a6]">Пока нет рук за этот период.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {statLabels.map(([key, label]) => (
              <StatBlock key={key} label={label} stat={statOf(stats, key)} />
            ))}
          </div>
          <h2 className="text-lg font-semibold">По позициям</h2>
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <article key={row.position} className="rounded-2xl bg-[#102019] p-3 ring-1 ring-[#345445]">
                <h3 className="mb-2 font-semibold">{row.position}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {statLabels.map(([key, label]) => (
                    <StatBlock
                      key={key}
                      label={label}
                      stat={statOf(row.stats, key)}
                      dash={key === 'ats' && !row.atsApplies}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
