import { Terminal } from 'lucide-react'
import { useStore } from 'zustand'
import { RequestLog } from '@/components/request-log/RequestLog'
import { requestLogStore } from '@/lib/http'
import { uiStore, useUi } from './uiStore'

/** Brings the hidden log back; shows how many requests are in flight meanwhile. */
function ShowLogButton() {
  const inFlight = useStore(requestLogStore, (state) => state.counters.inFlight)
  return (
    <div className="flex justify-end p-2">
      <button
        type="button"
        className="bg-log-background text-log-foreground flex items-center gap-2 px-2 py-1 font-mono text-xs shadow"
        onClick={() => {
          uiStore.getState().setLogHidden(false)
        }}
      >
        <Terminal className="size-3.5" />
        show request log{inFlight > 0 && ` · ${String(inFlight)} in flight`}
      </button>
    </div>
  )
}

/** The Matrix request log, docked at the bottom, wired to the app's log and layout stores. */
export function LogDock() {
  const entries = useStore(requestLogStore, (state) => state.entries)
  const counters = useStore(requestLogStore, (state) => state.counters)
  const open = useUi((state) => state.logOpen)
  const hidden = useUi((state) => state.logHidden)
  const revealed = useUi((state) => state.logRevealed)
  const filter = useUi((state) => state.logFilter)
  if (hidden) return <ShowLogButton />
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
      onHide={() => {
        uiStore.getState().setLogHidden(true)
      }}
    />
  )
}
