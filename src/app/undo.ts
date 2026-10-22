import { useSyncExternalStore } from 'react'

export interface UndoOffer {
  batchId: string
  label: string
}

let offer: UndoOffer | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function offerUndo(next: UndoOffer): void {
  offer = next
  emit()
}

export function clearUndo(): void {
  offer = null
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useUndoOffer(): UndoOffer | null {
  return useSyncExternalStore(subscribe, () => offer, () => null)
}
