import { useEffect, useRef, useState } from 'react'
import { requestPersistentStorage } from '../../db/persist'
import { errorText, exportCsv, exportJson, importJsonFile } from '../../app/files'
import { useLiveQuery } from '../../app/useLiveQuery'
import { Button } from '../../app/ui'
import { db } from '../../db/db'

export function SettingsScreen() {
  const meta = useLiveQuery(() => db.meta.get('app'), [])
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted)
  }, [])

  async function run(action: () => Promise<void>) {
    setError(null)
    setStatus(null)
    try {
      await action()
    } catch (cause: unknown) {
      setError(errorText(cause, 'Не удалось выполнить'))
    }
  }

  const exported = meta?.lastExportAt
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(meta.lastExportAt)
    : null

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold">Настройки</h1>
        <p className="text-sm text-[#9bb0a6]">Всё хранится на этом устройстве. Сети и входа нет.</p>
      </header>

      {persisted === false && (
        <p className="rounded-2xl bg-[#2a2416] p-3 text-sm text-[#f3e6c4]">
          Браузер не закрепил данные. Поставьте приложение на экран и храните экспорт JSON.
        </p>
      )}

      <Button
        tone="gold"
        className="w-full"
        onClick={() =>
          void run(async () => {
            await exportJson()
            setStatus('JSON сохранён')
          })
        }
      >
        Экспорт JSON
      </Button>
      <Button
        tone="neutral"
        className="w-full"
        onClick={() =>
          void run(async () => {
            await exportCsv()
            setStatus('CSV сохранён')
          })
        }
      >
        Экспорт CSV
      </Button>
      <label className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-[#1c2e26] px-3 text-base font-semibold">
        Импорт JSON
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            void run(async () => {
              const result = await importJsonFile(file)
              setStatus(`Импортировано: ${result.sessions} сессий, ${result.hands} рук`)
            })
          }}
        />
      </label>
      {exported && <p className="text-sm text-[#9bb0a6]">Последний экспорт: {exported}</p>}
      {status && <p className="text-sm text-[#d5e4db]">{status}</p>}
      {error && (
        <p role="alert" className="text-sm text-[#ffb4a8]">
          {error}
        </p>
      )}
    </section>
  )
}
