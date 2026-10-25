import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronUp, Download, Eye, EyeOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  exportableEntries,
  type RequestLogCounters,
  type RequestLogEntry,
  type RequestState,
} from '@/lib/http'
import { cn } from '@/lib/utils'
import { downloadJson } from '../download'
import { filterEntries, policyProgress, type LogFilter, type Progress } from './filter'
import { formatLine } from './format'

const LINE_HEIGHT = 18

const LINE_COLOR: Record<RequestState, string> = {
  pending: 'text-log-foreground animate-pulse motion-reduce:animate-none',
  ok: 'text-log-foreground',
  empty: 'text-log-dim',
  error: 'text-log-error',
  cancelled: 'text-log-dim',
}

export interface RequestLogProps {
  readonly entries: readonly RequestLogEntry[]
  readonly counters: RequestLogCounters
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Shows the unmasked URLs instead of `{sub}` / `{tid}`. On screen only; the export stays masked. */
  readonly revealed: boolean
  readonly onRevealedChange: (revealed: boolean) => void
  readonly filter: LogFilter
  readonly onFilterChange: (filter: LogFilter) => void
}

/**
 * The Matrix request log: every ARM and Graph request as one green line, streaming while the
 * analysis loads. It follows new lines until you scroll up, and follows again from the bottom.
 */
export function RequestLog(props: RequestLogProps) {
  const { entries, counters, open, onOpenChange } = props
  const progress = useMemo(() => policyProgress(entries), [entries])
  return (
    <section
      aria-label="Request log"
      className="bg-log-background text-log-foreground font-mono text-xs"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5">
        <button
          type="button"
          className="flex items-center gap-2"
          aria-expanded={open}
          onClick={() => {
            onOpenChange(!open)
          }}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          <span>
            &gt; requests: {counters.inFlight} in flight · {counters.finished} done ·{' '}
            {counters.errors} errors · {counters.retries} retries
          </span>
        </button>
        {progress && progress.done < progress.total && <PolicyProgress progress={progress} />}
        {open && <Controls {...props} />}
      </div>
      {open && <Lines {...props} />}
    </section>
  )
}

function PolicyProgress({ progress }: { progress: Progress }) {
  const { done, total } = progress
  return (
    <div className="flex items-center gap-2">
      <span>
        policies {done}/{total}
      </span>
      <div
        role="progressbar"
        aria-label="Operation policies fetched"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="bg-log-dim/30 h-1.5 w-24 overflow-hidden"
      >
        <div
          className="bg-log-foreground h-full"
          style={{ width: `${String((done / total) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function Toggle(props: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      aria-label={props.label}
      onClick={props.onClick}
      className={cn(
        'border-log-dim/50 flex items-center gap-1 border px-1.5',
        props.pressed ? 'bg-log-foreground text-log-background' : 'hover:border-log-foreground',
      )}
    >
      {props.children}
    </button>
  )
}

function Choice<T extends string>(props: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={props.label} className="flex">
      {props.options.map((option) => (
        <Toggle
          key={option}
          pressed={option === props.value}
          onClick={() => {
            props.onChange(option)
          }}
        >
          {option}
        </Toggle>
      ))}
    </div>
  )
}

const SOURCES = ['all', 'arm', 'graph'] as const
const STATUSES = ['all', 'problems', 'pending'] as const

function Controls(props: RequestLogProps) {
  const { entries, filter, onFilterChange, revealed, onRevealedChange } = props
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3">
      <Choice
        label="Source"
        options={SOURCES}
        value={filter.source}
        onChange={(source) => {
          onFilterChange({ ...filter, source })
        }}
      />
      <Choice
        label="Status"
        options={STATUSES}
        value={filter.status}
        onChange={(status) => {
          onFilterChange({ ...filter, status })
        }}
      />
      <Toggle
        pressed={revealed}
        label="Reveal subscription and tenant IDs"
        onClick={() => {
          onRevealedChange(!revealed)
        }}
      >
        {revealed ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        ids
      </Toggle>
      <Toggle
        pressed={false}
        label="Export the log as JSON (masked)"
        onClick={() => {
          downloadJson('request-log.json', exportableEntries(entries))
        }}
      >
        <Download className="size-3.5" />
        export
      </Toggle>
    </div>
  )
}

function lineTitle(entry: RequestLogEntry, url: string): string {
  return [url, entry.queryKey, entry.error].filter(Boolean).join('\n')
}

/** The virtualized lines. Follows the tail while scrolled to the bottom. */
function Lines({ entries, filter, revealed }: RequestLogProps) {
  const lines = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  // The virtualizer's functions change identity on every render; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  })

  useEffect(() => {
    if (following && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: 'end' })
    }
  }, [following, lines.length, virtualizer])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    setFollowing(fromBottom < LINE_HEIGHT)
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-56 overflow-y-auto px-3 pb-2"
        data-testid="request-log-lines"
      >
        {lines.length === 0 && (
          <p className="text-log-dim">
            {entries.length === 0 ? 'no requests yet.' : 'no lines match the filter.'}
          </p>
        )}
        <ol className="relative" style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
          {virtualizer.getVirtualItems().map((item) => {
            const entry = lines[item.index]
            if (!entry) return null
            const url = revealed ? entry.rawUrl : entry.url
            return (
              <li
                key={entry.id}
                title={lineTitle(entry, url)}
                className={cn(
                  'absolute inset-x-0 truncate whitespace-pre',
                  LINE_COLOR[entry.state],
                )}
                style={{ height: `${String(LINE_HEIGHT)}px`, top: `${String(item.start)}px` }}
              >
                {formatLine(entry, url)}
              </li>
            )
          })}
        </ol>
      </div>
      {!following && (
        <button
          type="button"
          className="bg-log-foreground text-log-background absolute right-5 bottom-3 px-2"
          onClick={() => {
            setFollowing(true)
          }}
        >
          paused · jump to latest
        </button>
      )}
    </div>
  )
}
