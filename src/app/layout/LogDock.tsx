import { ChevronDown, ChevronUp } from 'lucide-react'
import { useStore } from 'zustand'
import { requestLogStore, type RequestLogEntry } from '@/lib/http'
import { cn } from '@/lib/utils'
import { uiStore, useUi } from './uiStore'

/** Lines kept on screen until M5 brings the virtualized Matrix log. */
const VISIBLE_LINES = 200

function formatLine(entry: RequestLogEntry): string {
  const status = entry.state === 'pending' ? '...' : String(entry.status ?? entry.state)
  const duration = entry.durationMs === undefined ? '' : `${String(entry.durationMs)}ms`
  return [entry.method, status, duration, entry.api, entry.url, entry.label ?? ''].join(' ').trim()
}

const LINE_COLOR: Record<RequestLogEntry['state'], string> = {
  pending: 'text-log-foreground animate-pulse motion-reduce:animate-none',
  ok: 'text-log-foreground',
  empty: 'text-log-dim',
  error: 'text-log-error',
  cancelled: 'text-log-dim',
}

/**
 * The request log, docked at the bottom. URLs are masked (`{sub}`, `{tid}`). M5 replaces the
 * contents with the full Matrix log (virtualized, filters, export).
 */
export function LogDock() {
  const open = useUi((state) => state.logOpen)
  const entries = useStore(requestLogStore, (state) => state.entries)
  const counters = useStore(requestLogStore, (state) => state.counters)
  const visible = entries.slice(-VISIBLE_LINES)

  return (
    <section
      aria-label="Request log"
      className="bg-log-background text-log-foreground font-mono text-xs"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-1.5"
        aria-expanded={open}
        onClick={() => {
          uiStore.getState().setLogOpen(!open)
        }}
      >
        <span>
          &gt; requests: {counters.inFlight} in flight · {counters.finished} done ·{' '}
          {counters.errors} errors · {counters.retries} retries
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
      {open && (
        <ol className="max-h-56 overflow-y-auto px-3 pb-2">
          {visible.length === 0 && <li className="text-log-dim">no requests yet.</li>}
          {visible.map((entry) => (
            <li key={entry.id} className={cn('break-all', LINE_COLOR[entry.state])}>
              {formatLine(entry)}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
