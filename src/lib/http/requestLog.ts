import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ApiKind } from '@/lib/token'
import type { HttpErrorKind } from './errors'
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
  /**
   * Masked error message, shown on screen only. It can quote Azure's own text (UPNs, object IDs,
   * resource names), so it is never exported; `errorKind` is.
   */
  readonly error: string | undefined
  readonly errorKind: HttpErrorKind | undefined
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
  /** Replaces the start label, e.g. to add how many `$batch` sub-responses failed. */
  readonly label?: string | undefined
  readonly status?: number | undefined
  readonly bytes?: number | undefined
  readonly error?: string | undefined
  readonly errorKind?: HttpErrorKind | undefined
}

/** What the HTTP client calls. Every request is logged here, so callers never log manually. */
export interface RequestLogger {
  start(request: RequestStart): number
  retry(id: number, status: number): void
  finish(id: number, result: RequestFinish): void
}

export interface RequestLogCounters {
  readonly inFlight: number
  /** Requests that have ended, in any state: ok, empty, error or cancelled. */
  readonly finished: number
  /** Finished requests in the `error` state. */
  readonly errors: number
  /** Retries of throttled (429 / 503) requests. */
  readonly retries: number
}

export interface RequestLogState extends RequestLogger {
  /** Oldest first; capped at `capacity`. Counters keep counting past the cap. */
  readonly entries: readonly RequestLogEntry[]
  readonly counters: RequestLogCounters
  clear(): void
}

/** The fields that may leave the browser. Listed explicitly, so a new unmasked field is never exported by accident. */
const EXPORTED_FIELDS = [
  'id',
  'api',
  'method',
  'url',
  'label',
  'queryKey',
  'state',
  'status',
  'startedAt',
  'durationMs',
  'bytes',
  'retries',
  'errorKind',
] as const satisfies readonly Exclude<keyof RequestLogEntry, 'rawUrl' | 'error'>[]

export type ExportedLogEntry = Pick<RequestLogEntry, (typeof EXPORTED_FIELDS)[number]>

/** Entries for the JSON export: allowlisted fields only, so URLs are always masked and Azure's error text stays out. */
export function exportableEntries(entries: readonly RequestLogEntry[]): ExportedLogEntry[] {
  return entries.map(
    (entry) =>
      Object.fromEntries(EXPORTED_FIELDS.map((field) => [field, entry[field]])) as ExportedLogEntry,
  )
}

const EMPTY_COUNTERS: RequestLogCounters = { inFlight: 0, finished: 0, errors: 0, retries: 0 }

export function createRequestLogStore(
  options: { capacity?: number; now?: () => number } = {},
): StoreApi<RequestLogState> {
  const capacity = options.capacity ?? 2000
  const now = options.now ?? (() => performance.now())
  let nextId = 1
  // Requests started since the last clear() and not yet finished. retry()/finish() for any other id
  // (e.g. a request that was in flight when the log was cleared) are ignored, so counters stay true.
  const inFlight = new Set<number>()

  /**
   * Replaces one entry. Ids are consecutive and entries are only dropped from the front, so the
   * index is computed instead of searched. An entry already dropped by the capacity cap is skipped.
   */
  const update = (
    entries: readonly RequestLogEntry[],
    id: number,
    patch: (e: RequestLogEntry) => RequestLogEntry,
  ): readonly RequestLogEntry[] => {
    const index = id - (entries[0]?.id ?? id)
    const entry = entries[index]
    return entry?.id === id ? entries.with(index, patch(entry)) : entries
  }

  return createStore<RequestLogState>()((set, get) => ({
    entries: [],
    counters: EMPTY_COUNTERS,

    start(request) {
      const id = nextId++
      inFlight.add(id)
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
        errorKind: undefined,
      }
      const { entries, counters } = get()
      const kept =
        entries.length >= capacity ? entries.slice(entries.length - capacity + 1) : entries
      set({ entries: [...kept, entry], counters: { ...counters, inFlight: counters.inFlight + 1 } })
      return id
    },

    retry(id, status) {
      if (!inFlight.has(id)) return
      const { entries, counters } = get()
      set({
        entries: update(entries, id, (e) => ({ ...e, retries: e.retries + 1, status })),
        counters: { ...counters, retries: counters.retries + 1 },
      })
    },

    finish(id, result) {
      if (!inFlight.delete(id)) return
      const { entries, counters } = get()
      set({
        entries: update(entries, id, (e) => ({
          ...e,
          state: result.state,
          label: result.label ?? e.label,
          status: result.status ?? e.status,
          bytes: result.bytes,
          error: result.error,
          errorKind: result.errorKind,
          durationMs: Math.round(now() - e.startedAt),
        })),
        counters: {
          ...counters,
          inFlight: counters.inFlight - 1,
          finished: counters.finished + 1,
          errors: counters.errors + (result.state === 'error' ? 1 : 0),
        },
      })
    },

    clear() {
      inFlight.clear()
      set({ entries: [], counters: EMPTY_COUNTERS })
    },
  }))
}

/** The app-wide request log. The Matrix log view (M5) renders this. */
export const requestLogStore = createRequestLogStore()
