/** IndexedDB не клонирует `undefined`, поэтому пустые поля снимаются до записи. */
export function definedOnly<T extends object>(value: T): T {
  const copy = { ...value }
  for (const key of Object.keys(copy) as (keyof T)[]) {
    if (copy[key] === undefined) delete copy[key]
  }
  return copy
}
