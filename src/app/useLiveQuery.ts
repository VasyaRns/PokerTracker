import { liveQuery } from 'dexie'
import { useEffect, useState, type DependencyList } from 'react'

/** `deps` — список зависимостей запроса, как у `useEffect`. */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined)

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: (next) => setValue(next),
      error: (error) => console.error(error),
    })
    return () => subscription.unsubscribe()
  }, deps)

  return value
}
