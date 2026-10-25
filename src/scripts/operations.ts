import type { AccessModel, Operation } from '@/domain'

/** Operation lookups the scripts share, as text. */
export interface OperationLookup {
  byId(id: string): Operation | undefined
  /** `GET /orders`, or the ID while the operation is unknown. */
  text(id: string): string
  /** Distinct operations, comma-separated; past `max`, the rest are counted, not named. */
  list(ids: Iterable<string>, max?: number): string
}

/** Built once per run: a script looks operations up for every row, on models of any size. */
export function operationLookup(model: AccessModel): OperationLookup {
  const index = new Map(model.operations.map(({ operation }) => [operation.id, operation]))
  const text = (id: string) => {
    const operation = index.get(id)
    return operation ? `${operation.method} ${operation.urlTemplate}` : id
  }
  return {
    byId: (id) => index.get(id),
    text,
    list: (ids, max = Infinity) => {
      const distinct = [...new Set(ids)]
      const named = distinct.slice(0, max).map(text).join(', ')
      const rest = distinct.length - max
      return rest > 0 ? `${named} and ${String(rest)} more` : named
    },
  }
}
