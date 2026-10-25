import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { ALL_LINES, type LogFilter } from '@/components/request-log/filter'

/** The scripts page's place in the navigation, next to the view IDs. No view may use it. */
export const SCRIPTS_PAGE_ID = 'scripts'

/** Layout state: which view is open and how the request log is shown. In memory only. */
export interface UiState {
  /**
   * A view ID from `views/registry.ts`, or `SCRIPTS_PAGE_ID`; undefined shows the landing page.
   */
  readonly activeViewId: string | undefined
  /** A script ID from `scripts/registry.ts`, chosen on the scripts page. */
  readonly activeScriptId: string | undefined
  readonly logOpen: boolean
  /** The log is removed from the page; a small button brings it back. */
  readonly logHidden: boolean
  /** The log shows unmasked URLs. Reset by "Clear session", like the rest of this store. */
  readonly logRevealed: boolean
  readonly logFilter: LogFilter
  openView(id: string | undefined): void
  /** Opens the scripts page on this script. */
  openScript(id: string): void
  setLogOpen(open: boolean): void
  setLogHidden(hidden: boolean): void
  setLogRevealed(revealed: boolean): void
  setLogFilter(filter: LogFilter): void
  reset(): void
}

const INITIAL = {
  activeViewId: undefined,
  activeScriptId: undefined,
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
  openScript(activeScriptId) {
    set({ activeViewId: SCRIPTS_PAGE_ID, activeScriptId })
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
