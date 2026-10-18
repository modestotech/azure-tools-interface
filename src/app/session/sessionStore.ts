import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { normalizeToken, type ApiKind } from '@/lib/token'

/**
 * Tokens and IDs live here, in memory only. No persist middleware, no storage, no URL.
 * Reloading or closing the tab erases them.
 */
export interface SessionState {
  readonly armToken: string
  readonly graphToken: string
  readonly tenantId: string
  readonly subscriptionId: string
  setToken(api: ApiKind, raw: string): void
  setTenantId(tenantId: string): void
  setSubscriptionId(subscriptionId: string): void
  reset(): void
}

const EMPTY = { armToken: '', graphToken: '', tenantId: '', subscriptionId: '' } as const

export const sessionStore = createStore<SessionState>()((set) => ({
  ...EMPTY,
  setToken(api, raw) {
    const token = normalizeToken(raw)
    set(api === 'arm' ? { armToken: token } : { graphToken: token })
  },
  setTenantId(tenantId) {
    set({ tenantId: tenantId.trim() })
  },
  setSubscriptionId(subscriptionId) {
    set({ subscriptionId: subscriptionId.trim() })
  },
  reset() {
    set(EMPTY)
  },
}))

export function useSession<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector)
}

/** The entered token for `api`, or undefined when none is. No validation: the HTTP client does that. */
export function sessionToken(state: SessionState, api: ApiKind): string | undefined {
  const token = api === 'arm' ? state.armToken : state.graphToken
  return token || undefined
}
