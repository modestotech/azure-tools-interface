import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { setGraphAllowed } from '@/lib/http/networkGuard'
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
  /**
   * Whether Entra (Microsoft Graph) is used. False is ARM-only mode: no Graph token is kept, no
   * Graph request is made, and the network guard refuses any that is tried.
   */
  readonly entra: boolean
  /** Ignored for Graph in ARM-only mode, so a Graph token can't be kept there. */
  setToken(api: ApiKind, raw: string): void
  /** Switching to ARM only drops the Graph token. */
  setEntra(enabled: boolean): void
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

const EMPTY: Pick<SessionState, 'tokens' | 'tenantId' | 'subscriptionId' | 'entra'> = {
  tokens: { arm: '', graph: '' },
  tenantId: '',
  subscriptionId: '',
  entra: true,
}

export const sessionStore = createStore<SessionState>()((set) => ({
  ...EMPTY,
  setToken(api, raw) {
    set((state) =>
      api === 'graph' && !state.entra
        ? state
        : { tokens: { ...state.tokens, [api]: normalizeToken(raw) } },
    )
  },
  setEntra(entra) {
    set((state) => ({ entra, tokens: entra ? state.tokens : { ...state.tokens, graph: '' } }))
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

// The network guard follows the mode: in ARM-only mode it refuses every Graph request, and with
// that every POST, so a GET to ARM is the only request that can leave the browser.
setGraphAllowed(sessionStore.getState().entra)
sessionStore.subscribe((state) => {
  setGraphAllowed(state.entra)
})

export function useSession<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector)
}

/** The entered token for `api`, or undefined when none is. No validation: the HTTP client does that. */
export function sessionToken(state: SessionState, api: ApiKind): string | undefined {
  return state.tokens[api] || undefined
}
