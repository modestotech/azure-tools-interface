import { QueryClient, type Query } from '@tanstack/react-query'
import { API_RESOURCES, type ApiKind } from '@/lib/token'
import { sessionStore } from './sessionStore'

/**
 * The app's single TanStack Query cache. Fetched data stays fresh for the session: nothing
 * refetches on its own (window focus, reconnect), so the request log only shows requests the user
 * caused. Retries are off because the HTTP client already retries 429 / 503, and query functions
 * return a ResourceResult rather than throwing. `clearSession()` empties it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

/** A query whose last answer was forbidden or an error (query data is a ResourceResult). */
function failed(query: Query): boolean {
  const { data } = query.state
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    (data.status === 'error' || data.status === 'forbidden')
  )
}

/**
 * Nothing refetches on its own, so a call that failed with an expired or wrong token would keep
 * its error. When a token changes, refetch that API's failed queries; good data stays.
 */
export function retryFailedQueries(api: ApiKind): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: [api], predicate: failed })
}

sessionStore.subscribe((state, previous) => {
  for (const api of Object.keys(API_RESOURCES) as ApiKind[]) {
    if (state.tokens[api] && state.tokens[api] !== previous.tokens[api])
      void retryFailedQueries(api)
  }
})
