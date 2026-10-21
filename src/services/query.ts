import { queryOptions, skipToken, type QueryKey } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
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
