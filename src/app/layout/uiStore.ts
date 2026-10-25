import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { ALL_LINES, type LogFilter } from '@/components/request-log/filter'

/** Layout state: which view is open and how the request log is shown. In memory only. */
export interface UiState {
  /** A view ID from `views/registry.ts`; undefined shows the landing page. */
  readonly activeViewId: string | undefined
  readonly logOpen: boolean
  /** The log is removed from the page; a small button brings it back. */
  readonly logHidden: boolean
  /** The log shows unmasked URLs. Reset by "Clear session", like the rest of this store. */
  readonly logRevealed: boolean
  readonly logFilter: LogFilter
  openView(id: string | undefined): void
  setLogOpen(open: boolean): void
  setLogHidden(hidden: boolean): void
  setLogRevealed(revealed: boolean): void
  setLogFilter(filter: LogFilter): void
  reset(): void
}

const INITIAL = {
  activeViewId: undefined,
  logOpen: true,
  logHidden: false,
  logRevealed: false,
  logFilter: ALL_LINES,
}

export const uiStore = createStore<UiState>()((set) => ({
  ...INITIAL,
  openView(activeViewId) {
    set({ activeViewId })
  },
  setLogOpen(logOpen) {
    set({ logOpen })
  },
  setLogHidden(logHidden) {
    set({ logHidden })
  },
  setLogRevealed(logRevealed) {
    set({ logRevealed })
  },
  setLogFilter(logFilter) {
    set({ logFilter })
  },
  reset() {
    set(INITIAL)
  },
}))

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector)
}
