import type { RequestLogEntry } from '@/lib/http'
import { API_RESOURCES, type ApiKind } from '@/lib/token'

/**
 * Pure formatting for the Matrix log lines: `GET 200 143ms 4.2kB arm …/service/{svc}/apis`.
 */

/** `512B`, `4.2kB`, `1.3MB`; empty while unknown. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1000) return `${String(bytes)}B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)}kB`
  return `${(bytes / 1_000_000).toFixed(1)}MB`
}

/** The status column: `...` while pending, the HTTP status when known, otherwise the state. */
export function formatStatus(entry: RequestLogEntry): string {
  if (entry.state === 'pending') return '...'
  if (entry.state === 'cancelled') return 'cancelled'
  return entry.status === undefined ? entry.state : String(entry.status)
}

export function formatDuration(entry: RequestLogEntry): string {
  return entry.durationMs === undefined ? '' : `${String(entry.durationMs)}ms`
}

const API_VERSION = /([?&])api-version=[^&]*&?/
const ARM_SERVICE_PREFIX = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/[^/]+(?=\/)/

/** Percent-decodes for reading; a malformed escape leaves the text as it was. */
function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * The URL as a log line shows it: without the API's base URL and the `api-version`, with the ARM
 * path up to the provider folded to `…`, and Graph queries decoded. The full URL stays in the
 * line's tooltip.
 */
export function shortUrl(api: ApiKind, url: string): string {
  const base = API_RESOURCES[api].baseUrl
  const path = url.startsWith(base) ? url.slice(base.length) : url
  if (api === 'graph') return decode(path)
  return path
    .replace(API_VERSION, (_, separator: string) => separator)
    .replace(/[?&]$/, '')
    .replace(ARM_SERVICE_PREFIX, '…')
}

/** One log line, with the URL as given (masked or revealed). */
export function formatLine(entry: RequestLogEntry, url: string): string {
  return [
    entry.method,
    formatStatus(entry),
    formatDuration(entry),
    formatBytes(entry.bytes),
    entry.api,
    shortUrl(entry.api, url),
    entry.label ?? '',
    entry.retries > 0 ? `↻${String(entry.retries)}` : '',
    entry.state === 'error' ? `✗ ${entry.errorKind ?? 'error'}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
