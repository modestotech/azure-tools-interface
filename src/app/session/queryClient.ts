import { QueryClient } from '@tanstack/react-query'

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
