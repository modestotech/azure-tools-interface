import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { isSubscriptionId, isTenantId, normalizeToken, type ApiKind } from '@/lib/token'

/**
 * Tokens and IDs live here, in memory only. No persist middleware, no storage, no URL.
 * Reloading or closing the tab erases them.
 */
export interface SessionState {
  /** One token per API; `''` when none is entered. */
  readonly tokens: Readonly<Record<ApiKind, string>>
  readonly tenantId: string
  /**
   * Selected subscription, used to mask URLs as `{sub}`. It lives here rather than in the
   * selection store because masking needs it; changing it resets the selected instance and API.
   */
  readonly subscriptionId: string
  setToken(api: ApiKind, raw: string): void
  /**
   * Stores a tenant GUID or domain name. Anything else is stored as `''` and returns false, so an
   * invalid value never reaches a URL, the masking or an `az` command. Keep the typed draft in the
   * input field, not here.
   */
  setTenantId(tenantId: string): boolean
  /** Stores a subscription GUID. Anything else is stored as `''` and returns false. */
  setSubscriptionId(subscriptionId: string): boolean
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
    const value = tenantId.trim()
    const valid = isTenantId(value)
    set({ tenantId: valid ? value : '' })
    return valid
  },
  setSubscriptionId(subscriptionId) {
    const value = subscriptionId.trim()
    const valid = isSubscriptionId(value)
    set({ subscriptionId: valid ? value : '' })
    return valid
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
