import { formatLocalDate } from '../domain/dates'
import { markExported } from '../db/persist'
import { handsToCsv, importBundle, readBundle } from '../db/transfer'

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function exportJson(): Promise<void> {
  const bundle = await readBundle()
  const stamp = formatLocalDate(Date.now())
  downloadText(`pokertracker-${stamp}.json`, `${JSON.stringify(bundle, null, 2)}\n`, 'application/json')
  await markExported()
}

export async function exportCsv(): Promise<void> {
  const bundle = await readBundle()
  const stamp = formatLocalDate(Date.now())
  downloadText(
    `pokertracker-${stamp}.csv`,
    handsToCsv(bundle.sessions, bundle.hands),
    'text/csv;charset=utf-8',
  )
}

export async function importJsonFile(file: File): Promise<{ sessions: number; hands: number }> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text()) as unknown
  } catch {
    throw new Error('Файл не является JSON')
  }
  return importBundle(raw)
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
