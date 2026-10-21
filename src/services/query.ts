import {
  queryOptions,
  skipToken,
  useQueries,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo } from 'react'
import type { HttpClient } from '@/lib/http'
import { queryKeys } from './queryKeys'
import type { ResourceResult } from './result'

/**
 * Shared pieces of the query hooks. Services never import the app's client, so the hooks read it
 * from this context, which the app shell provides (`<HttpClientContext value={httpClient}>`).
 */
export const HttpClientContext = createContext<HttpClient | null>(null)

export function useHttpClient(): HttpClient {
  const client = useContext(HttpClientContext)
  if (!client) throw new Error('useHttpClient needs an HttpClientContext provider.')
  return client
}

/**
 * Query options for a load whose inputs may not be chosen yet. Until `input` is defined the query
 * is skipped (`skipToken`), so nothing is fetched before the user picks a subscription, service or
 * API. The load returns a ResourceResult and never throws an HttpError, so TanStack's own retry
 * never kicks in; the HTTP client already retries 429 / 503.
 */
export function resourceQuery<Input, T>(
  input: Input | undefined,
  key: (input: Input) => QueryKey,
  load: (input: Input, signal: AbortSignal) => Promise<ResourceResult<T>>,
) {
  return queryOptions({
    queryKey: input === undefined ? queryKeys.waiting : key(input),
    queryFn: input === undefined ? skipToken : ({ signal }) => load(input, signal),
  })
}

export type ResourceQueryOptions<T> = ReturnType<typeof resourceQuery<unknown, T>>

/**
 * One query per key, combined into a Map from key to its ResourceResult (undefined while
 * loading). The Map is rebuilt only when a query result changes, so callers can memoize on it.
 */
export function useResourceQueries<T>(
  keys: readonly string[],
  options: (key: string) => ResourceQueryOptions<T>,
): ReadonlyMap<string, ResourceResult<T> | undefined> {
  // A new array with the same keys must not count as a change.
  const signature = JSON.stringify(keys)
  const stableKeys = useMemo(() => JSON.parse(signature) as string[], [signature])
  const combine = useCallback(
    (results: UseQueryResult<ResourceResult<T>>[]) =>
      new Map(stableKeys.map((key, index) => [key, results[index]?.data])),
    [stableKeys],
  )
  return useQueries({ queries: stableKeys.map(options), combine })
}
