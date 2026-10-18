import { setupWorker, type StartOptions } from 'msw/browser'
import { API_RESOURCES } from '@/lib/token'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

const AZURE_ORIGINS = new Set(Object.values(API_RESOURCES).map((r) => r.origin))

/**
 * Demo mode serves fictional data. An ARM/Graph call without a handler fails instead of reaching
 * real Azure, in case someone pastes a real token into the demo. Other requests (Vite's own
 * modules, assets) pass through.
 */
export const onUnhandledRequest: NonNullable<StartOptions['onUnhandledRequest']> = (
  request,
  print,
) => {
  if (AZURE_ORIGINS.has(new URL(request.url).origin)) print.error()
}
