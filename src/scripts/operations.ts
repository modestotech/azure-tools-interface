import type { AccessModel, Operation } from '@/domain'

/** Helpers the scripts share: operation lookups, as text. */

export function operationById(model: AccessModel, id: string): Operation | undefined {
  return model.operations.find((access) => access.operation.id === id)?.operation
}

/** `GET /orders`, or the ID while the operation is unknown. */
export function operationText(model: AccessModel, id: string): string {
  const operation = operationById(model, id)
  return operation ? `${operation.method} ${operation.urlTemplate}` : id
}

export function operationsText(model: AccessModel, ids: Iterable<string>): string {
  return [...new Set(ids)].map((id) => operationText(model, id)).join(', ')
}
