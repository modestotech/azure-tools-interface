import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ApiKind } from '@/lib/token'
import type { HttpMethod } from './readOnly'

/** `empty`: a 404 the caller expects, e.g. no policy at a scope. Shown dimmed, not counted as an error. */
export type RequestState = 'pending' | 'ok' | 'empty' | 'error' | 'cancelled'

export interface RequestLogEntry {
  readonly id: number
  readonly api: ApiKind
  readonly method: HttpMethod
  /** URL with `{sub}` / `{tid}` masked. This is what the log shows by default and the only URL exported. */
  readonly url: string
  /** Unmasked URL, kept in memory for the "reveal" toggle. Never exported. Never contains a token. */
  readonly rawUrl: string
  /** Extra text such as `$batch ×12`. */
  readonly label: string | undefined
  /** Masked TanStack Query key, when the request belongs to one. */
  readonly queryKey: string | undefined
  readonly state: RequestState
  readonly status: number | undefined
  readonly startedAt: number
  readonly durationMs: number | undefined
  readonly bytes: number | undefined
  readonly retries: number
  /** Masked error message. */
  readonly error: string | undefined
}

export interface RequestStart {
  readonly api: ApiKind
  readonly method: HttpMethod
  readonly url: string
  readonly rawUrl: string
  readonly label?: string | undefined
  readonly queryKey?: string | undefined
}

export interface RequestFinish {
  readonly state: Exclude<RequestState, 'pending'>
  readonly status?: number | undefined
  readonly bytes?: number | undefined
  readonly error?: string | undefined
}

/** What the HTTP client calls. Every request is logged here, so callers never log manually. */
export interface RequestLogger {
  start(request: RequestStart): number
  retry(id: number, status: number): void
  finish(id: number, result: RequestFinish): void
}

export interface RequestLogCounters {
  readonly inFlight: number
  readonly done: number
  readonly errors: number
  readonly retries: number
}

export interface RequestLogState extends RequestLogger {
  /** Oldest first; capped at `capacity`. Counters keep counting past the cap. */
  readonly entries: readonly RequestLogEntry[]
  readonly counters: RequestLogCounters
  clear(): void
}

export type ExportedLogEntry = Omit<RequestLogEntry, 'rawUrl'>

/** Entries for the JSON export: masked URLs only. */
export function exportableEntries(entries: readonly RequestLogEntry[]): ExportedLogEntry[] {
  return entries.map(({ rawUrl, ...rest }) => rest)
}

const EMPTY_COUNTERS: RequestLogCounters = { inFlight: 0, done: 0, errors: 0, retries: 0 }

export function createRequestLogStore(
  options: { capacity?: number; now?: () => number } = {},
): StoreApi<RequestLogState> {
  const capacity = options.capacity ?? 2000
  const now = options.now ?? (() => performance.now())
  let nextId = 1

  const update = (
    entries: readonly RequestLogEntry[],
    id: number,
    patch: (e: RequestLogEntry) => RequestLogEntry,
  ) => entries.map((e) => (e.id === id ? patch(e) : e))

  return createStore<RequestLogState>()((set, get) => ({
    entries: [],
    counters: EMPTY_COUNTERS,

    start(request) {
      const id = nextId++
      const entry: RequestLogEntry = {
        id,
        api: request.api,
        method: request.method,
        url: request.url,
        rawUrl: request.rawUrl,
        label: request.label,
        queryKey: request.queryKey,
        state: 'pending',
        status: undefined,
        startedAt: now(),
        durationMs: undefined,
        bytes: undefined,
        retries: 0,
        error: undefined,
      }
      const { entries, counters } = get()
      const kept =
        entries.length >= capacity ? entries.slice(entries.length - capacity + 1) : entries
      set({ entries: [...kept, entry], counters: { ...counters, inFlight: counters.inFlight + 1 } })
      return id
    },

    retry(id, status) {
      const { entries, counters } = get()
      set({
        entries: update(entries, id, (e) => ({ ...e, retries: e.retries + 1, status })),
        counters: { ...counters, retries: counters.retries + 1 },
      })
    },

    finish(id, result) {
      const { entries, counters } = get()
      set({
        entries: update(entries, id, (e) => ({
          ...e,
          state: result.state,
          status: result.status ?? e.status,
          bytes: result.bytes,
          error: result.error,
          durationMs: Math.round(now() - e.startedAt),
        })),
        counters: {
          ...counters,
          inFlight: Math.max(0, counters.inFlight - 1),
          done: counters.done + 1,
          errors: counters.errors + (result.state === 'error' ? 1 : 0),
        },
      })
    },

    clear() {
      set({ entries: [], counters: EMPTY_COUNTERS })
    },
  }))
}

/** The app-wide request log. The Matrix log view (M5) renders this. */
export const requestLogStore = createRequestLogStore()
