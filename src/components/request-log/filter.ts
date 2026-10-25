import type { RequestLogEntry } from '@/lib/http'
import type { ApiKind } from '@/lib/token'

/** Which lines the log shows. Display only: counters and the export always cover every entry. */
export interface LogFilter {
  readonly source: 'all' | ApiKind
  /** `problems`: errors and cancelled requests; `pending`: still in flight. */
  readonly status: 'all' | 'problems' | 'pending'
}

export const ALL_LINES: LogFilter = { source: 'all', status: 'all' }

function matchesStatus(entry: RequestLogEntry, status: LogFilter['status']): boolean {
  switch (status) {
    case 'all':
      return true
    case 'problems':
      return entry.state === 'error' || entry.state === 'cancelled'
    case 'pending':
      return entry.state === 'pending'
  }
}

export function filterEntries(
  entries: readonly RequestLogEntry[],
  filter: LogFilter,
): readonly RequestLogEntry[] {
  if (filter.source === 'all' && filter.status === 'all') return entries
  return entries.filter(
    (entry) =>
      (filter.source === 'all' || entry.api === filter.source) &&
      matchesStatus(entry, filter.status),
  )
}

export interface Progress {
  readonly done: number
  readonly total: number
}

/** `…/apis/{apiId}/operations/{opId}/policies/policy`: group 1 identifies the API. */
const OPERATION_POLICY = /^(.*\/apis\/[^/]+)\/operations\/[^/]+\/policies\/policy(?:\?|$)/

/**
 * Progress of the operation policy fetches (one per operation) for the API fetched last. A
 * policy fetched again (e.g. after a token change) counts once, by its latest request. Undefined
 * when no operation policy has been requested.
 */
export function policyProgress(entries: readonly RequestLogEntry[]): Progress | undefined {
  let api: string | undefined
  const latest = new Map<string, RequestLogEntry>()
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    const match = entry && OPERATION_POLICY.exec(entry.url)
    if (!entry || !match) continue
    api ??= match[1]
    if (match[1] === api && !latest.has(entry.url)) latest.set(entry.url, entry)
  }
  if (latest.size === 0) return undefined
  const done = [...latest.values()].filter((entry) => entry.state !== 'pending').length
  return { done, total: latest.size }
}
