import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

/** Layout state: which view is open and whether the request log is expanded. In memory only. */
export interface UiState {
  /** A view ID from `views/registry.ts`; undefined shows the landing page. */
  readonly activeViewId: string | undefined
  readonly logOpen: boolean
  openView(id: string | undefined): void
  setLogOpen(open: boolean): void
  reset(): void
}

const INITIAL = { activeViewId: undefined, logOpen: true }

export const uiStore = createStore<UiState>()((set) => ({
  ...INITIAL,
  openView(activeViewId) {
    set({ activeViewId })
  },
  setLogOpen(logOpen) {
    set({ logOpen })
  },
  reset() {
    set(INITIAL)
  },
}))

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
