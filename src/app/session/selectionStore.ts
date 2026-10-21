import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { ApimServiceRef, ArmApi } from '@/services/arm'
import { sessionStore } from './sessionStore'

/**
 * The APIM instance and API being analyzed. The subscription stays in the session store, because
 * URL masking reads it there. In memory only, like the session; `clearSession()` resets it.
 */
export interface SelectionState {
  readonly service: ApimServiceRef | undefined
  readonly api: ArmApi | undefined
  /** Picks a service; the API must then be picked again. */
  selectService(service: ApimServiceRef | undefined): void
  selectApi(api: ArmApi | undefined): void
  reset(): void
}

export const selectionStore = createStore<SelectionState>()((set) => ({
  service: undefined,
  api: undefined,
  selectService(service) {
    set({ service, api: undefined })
  },
  selectApi(api) {
    set({ api })
  },
  reset() {
    set({ service: undefined, api: undefined })
  },
}))

// A new subscription invalidates the service and API picked under the old one.
sessionStore.subscribe((state, previous) => {
  if (state.subscriptionId !== previous.subscriptionId) selectionStore.getState().reset()
})

export function useSelection<T>(selector: (state: SelectionState) => T): T {
  return useStore(selectionStore, selector)
}
