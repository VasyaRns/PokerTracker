import { useState } from 'react'
import { deleteBatch } from '../db/hands'
import { countEnded, dismissExportReminder, shouldRemindExport } from '../db/persist'
import { EntryScreen } from '../features/entry/EntryScreen'
import { HandsScreen } from '../features/hands/HandsScreen'
import { SessionsScreen } from '../features/sessions/SessionsScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { StatsScreen } from '../features/stats/StatsScreen'
import { db } from '../db/db'
import { errorText, exportJson } from './files'
import { clearUndo, useUndoOffer } from './undo'
import { useLiveQuery } from './useLiveQuery'
import { Button } from './ui'

type Tab = 'entry' | 'stats' | 'hands' | 'sessions' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'entry', label: 'Ввод' },
  { id: 'stats', label: 'Статы' },
  { id: 'hands', label: 'Руки' },
  { id: 'sessions', label: 'Сессии' },
  { id: 'settings', label: 'Настройки' },
]

function ReminderBanner() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const meta = useLiveQuery(() => db.meta.get('app'), [])
  const [error, setError] = useState<string | null>(null)
  if (!sessions || !meta) return null
  if (!shouldRemindExport(countEnded(sessions), meta.reminderAnchor)) return null
  return (
    <div className="mx-4 mt-4 rounded-2xl bg-[#2a2416] p-3 ring-1 ring-[#e4c36a]/50">
      <p className="font-semibold">Пора экспортировать JSON</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          tone="gold"
          onClick={() => {
            void exportJson().catch((cause: unknown) => setError(errorText(cause, 'Не удалось экспортировать')))
          }}
        >
          Экспорт
        </Button>
        <Button tone="ghost" onClick={() => void dismissExportReminder()}>
          Скрыть
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-[#ffb4a8]">
          {error}
        </p>
      )}
    </div>
  )
}

function UndoToast() {
  const offer = useUndoOffer()
  const [error, setError] = useState<string | null>(null)
  if (!offer && !error) return null
  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] z-20 mx-auto max-w-md px-4">
      <div
        role="status"
        className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[#f3f6f4] px-3 text-[#102019] shadow-lg"
      >
        <span className="text-sm font-semibold">{error ?? offer?.label}</span>
        {offer && (
          <button
            type="button"
            className="min-h-12 px-3 text-base font-semibold text-[#6a3030]"
            onClick={() => {
              void deleteBatch(offer.batchId)
                .then(() => clearUndo())
                .catch((cause: unknown) => setError(errorText(cause, 'Не удалось отменить')))
            }}
          >
            Отменить
          </button>
        )}
      </div>
    </div>
  )
}

export function App() {
  const [tab, setTab] = useState<Tab>('entry')
  const undo = useUndoOffer()

  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <ReminderBanner />
      <main className={`px-4 pt-4 ${undo ? 'pb-44' : 'pb-28'}`}>
        {tab === 'entry' && <EntryScreen />}
        {tab === 'stats' && <StatsScreen />}
        {tab === 'hands' && <HandsScreen />}
        {tab === 'sessions' && <SessionsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <UndoToast />
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#345445] bg-[#0c1612]/95 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? 'page' : undefined}
              className={`min-h-12 flex-1 px-1 text-xs font-semibold ${tab === item.id ? 'text-[#e4c36a]' : 'text-[#9bb0a6]'}`}
              onClick={() => {
                setTab(item.id)
                window.scrollTo(0, 0)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
