import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { normalizeToken, type ApiKind } from '@/lib/token'

/**
 * Tokens and IDs live here, in memory only. No persist middleware, no storage, no URL.
 * Reloading or closing the tab erases them.
 */
export interface SessionState {
  /** One token per API; `''` when none is entered. */
  readonly tokens: Readonly<Record<ApiKind, string>>
  readonly tenantId: string
  /**
   * Selected subscription, used to mask URLs as `{sub}`. Stays here until the M4 selection store
   * exists; then decide whether it moves there with the APIM instance and API.
   */
  readonly subscriptionId: string
  setToken(api: ApiKind, raw: string): void
  setTenantId(tenantId: string): void
  setSubscriptionId(subscriptionId: string): void
  reset(): void
}

const EMPTY: Pick<SessionState, 'tokens' | 'tenantId' | 'subscriptionId'> = {
  tokens: { arm: '', graph: '' },
  tenantId: '',
  subscriptionId: '',
}

export const sessionStore = createStore<SessionState>()((set) => ({
  ...EMPTY,
  setToken(api, raw) {
    set((state) => ({ tokens: { ...state.tokens, [api]: normalizeToken(raw) } }))
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
  return state.tokens[api] || undefined
}
