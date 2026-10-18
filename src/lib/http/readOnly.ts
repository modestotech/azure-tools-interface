import { z } from 'zod'
import { API_RESOURCES, type ApiKind } from '@/lib/token'
import { HttpError } from './errors'

export const GRAPH_BATCH_URL = `${API_RESOURCES.graph.baseUrl}/$batch`
export const GRAPH_BATCH_MAX = 20

/**
 * A `$batch` sub-request URL is resolved by Graph against `/v1.0`, so it must stay a plain relative
 * path: no `..` or `.` segments, no `//`, no backslashes, and no percent-encoded dots or slashes
 * (`encodePathSegment` never produces them). The query string is left to `withQuery`.
 */
function isSafeBatchPath(url: string): boolean {
  const path = url.split('?', 1)[0] ?? ''
  return (
    path.startsWith('/') &&
    !path.includes('//') &&
    !url.includes('\\') &&
    !/%(2e|2f|5c)/i.test(path) &&
    !path.split('/').some((segment) => segment === '.' || segment === '..')
  )
}

const batchBodySchema = z.object({
  requests: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        method: z.literal('GET'),
        url: z.string().refine(isSafeBatchPath),
      }),
    )
    .min(1)
    .max(GRAPH_BATCH_MAX)
    .refine((requests) => new Set(requests.map((r) => r.id)).size === requests.length, {
      message: 'Sub-request ids must be unique.',
    }),
})

export type HttpMethod = 'GET' | 'POST'

/**
 * The app is read-only. Only GET is allowed, plus POST to Graph `$batch` when every
 * sub-request is a GET. Anything else throws before a request is sent.
 */
export function assertReadOnly(api: ApiKind, method: string, url: string, body: unknown): void {
  if (method === 'GET' && body === undefined) return
  if (
    method === 'POST' &&
    api === 'graph' &&
    url === GRAPH_BATCH_URL &&
    batchBodySchema.safeParse(body).success
  ) {
    return
  }
  throw new HttpError(
    'read-only-violation',
    api,
    `Blocked ${method} request: the app only sends GET requests (and Graph $batch wrapping GETs).`,
  )
}
