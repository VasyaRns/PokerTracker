export function parseNumber(value: string, label: string): number | undefined {
  const trimmed = value.trim().replace(',', '.')
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) throw new Error(`${label} — число`)
  return parsed
}
