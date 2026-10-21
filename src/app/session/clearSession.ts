import { requestLogStore } from '@/lib/http'
import { httpClient } from './httpClient'
import { queryClient } from './queryClient'
import { selectionStore } from './selectionStore'
import { sessionStore } from './sessionStore'

/**
 * Everything that holds session data registers here, so "Clear session" (and the safety notice's
 * promise that it wipes tokens and all fetched data) can't miss a cache that was added later:
 * the TanStack Query client, selection stores, view state, ...
 */
const clearHandlers = new Set<() => void>()

/** Registers a handler that wipes some session data. Returns a function that unregisters it. */
export function onClearSession(handler: () => void): () => void {
  clearHandlers.add(handler)
  return () => {
    clearHandlers.delete(handler)
  }
}

/**
 * "Clear session": forgets tokens and IDs, the HTTP client's token cache, the request log (its raw
 * URLs contain the IDs), every fetched resource in the query cache, the selected APIM instance and
 * API, and whatever registered with `onClearSession`. Every handler runs even if one throws; the
 * errors are rethrown together afterwards.
 */
export function clearSession(): void {
  const handlers = [
    () => {
      sessionStore.getState().reset()
    },
    () => {
      httpClient.reset()
    },
    () => {
      requestLogStore.getState().clear()
    },
    () => {
      queryClient.clear()
    },
    () => {
      selectionStore.getState().reset()
    },
    ...clearHandlers,
  ]
  const errors: unknown[] = []
  for (const handler of handlers) {
    try {
      handler()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0)
    throw new AggregateError(errors, 'Clear session: some data was not cleared.')
}
