export interface Stamped {
  id: string
  updatedAt: number
}

/**
 * Слияние по id. Побеждает больший `updatedAt`.
 * При равенстве остаётся запись, которая уже была локально.
 */
export function mergeByUpdatedAt<T extends Stamped>(local: readonly T[], incoming: readonly T[]): T[] {
  const merged = new Map<string, T>(local.map((item) => [item.id, item]))
  for (const item of incoming) {
    const existing = merged.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) merged.set(item.id, item)
  }
  return [...merged.values()]
}
