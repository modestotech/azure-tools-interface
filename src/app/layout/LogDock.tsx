import { useStore } from 'zustand'
import { RequestLog } from '@/components/request-log/RequestLog'
import { requestLogStore } from '@/lib/http'
import { uiStore, useUi } from './uiStore'

/** The Matrix request log, docked at the bottom, wired to the app's log and layout stores. */
export function LogDock() {
  const entries = useStore(requestLogStore, (state) => state.entries)
  const counters = useStore(requestLogStore, (state) => state.counters)
  const open = useUi((state) => state.logOpen)
  const revealed = useUi((state) => state.logRevealed)
  const filter = useUi((state) => state.logFilter)
  return (
    <RequestLog
      entries={entries}
      counters={counters}
      open={open}
      onOpenChange={(value) => {
        uiStore.getState().setLogOpen(value)
      }}
      revealed={revealed}
      onRevealedChange={(value) => {
        uiStore.getState().setLogRevealed(value)
      }}
      filter={filter}
      onFilterChange={(value) => {
        uiStore.getState().setLogFilter(value)
      }}
    />
  )
}
