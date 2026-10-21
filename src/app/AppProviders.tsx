import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { HttpClientContext } from '@/services/query'
import { httpClient } from './session/httpClient'
import { queryClient } from './session/queryClient'

/** The app-wide instances the hooks need: the query cache and the HTTP client. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <HttpClientContext value={httpClient}>{children}</HttpClientContext>
    </QueryClientProvider>
  )
}
