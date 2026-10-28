import type { z } from 'zod'
import {
  GRAPH_BATCH_MAX,
  HttpError,
  type BatchResponse,
  type HttpClient,
  type HttpErrorKind,
} from '@/lib/http'
import { resultFromError, settle, type ResourceResult } from '../result'
import type { LoadOptions } from './entra'
import { servicePrincipalSchema, type GraphServicePrincipal } from './schemas'
import { graphPaths, graphUrl } from './urls'

/**
 * Bulk Graph lookups through `$batch`, one POST per 20 lookups. Each lookup has its own
 * ResourceResult; a POST that fails gives its own lookups an error and leaves the others alone.
 */

export type BatchResults<T> = ReadonlyMap<string, ResourceResult<T>>

function kindForStatus(status: number): HttpErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 429 || status === 503) return 'throttled'
  return 'unexpected-status'
}

/** Graph's error code from a sub-response body, if any. Codes are safe to show; messages may not be. */
function errorCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined
  const { error } = body
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/**
 * One sub-response as a ResourceResult: 2xx is validated with `schema`, 404 is `empty`, 403 is
 * `forbidden`, anything else is an `error`. Messages carry the status and Graph's error code only.
 */
export function subResponseResult<T>(
  response: BatchResponse,
  url: string,
  schema: z.ZodType<T>,
): ResourceResult<T> {
  const { status, body } = response
  if (status === 404) return { status: 'empty' }
  if (status >= 200 && status < 300) {
    const parsed = schema.safeParse(body)
    if (parsed.success) return { status: 'ok', data: parsed.data }
    const message = `Unexpected $batch sub-response shape from ${url}.`
    return {
      status: 'error',
      error: new HttpError('invalid-response', 'graph', message, { status, url }),
    }
  }
  const code = errorCode(body)
  const message = `Graph answered ${String(status)}${code ? ` (${code})` : ''} for ${url}.`
  const error = new HttpError(kindForStatus(status), 'graph', message, { status, url })
  return status === 403 ? { status: 'forbidden', error } : { status: 'error', error }
}

/** One chunk's keys, with each key's result: from its sub-response, or the chunk's own failure. */
async function loadChunk<T>(
  client: HttpClient,
  chunk: readonly (readonly [string, string])[],
  schema: z.ZodType<T>,
  options: LoadOptions,
): Promise<[string, ResourceResult<T>][]> {
  const requests = chunk.map(([, url], index) => ({ id: String(index), url }))
  let responses: BatchResponse[]
  try {
    // The client returns exactly one response per request, in request order.
    responses = await client.batch(requests, options)
  } catch (error) {
    // The POST itself failed (network, 500, timeout): every key in it shares that result. A cancel
    // or a bug isn't an HttpError and is rethrown by resultFromError.
    const failed = resultFromError(error)
    return chunk.map(([key]) => [key, failed])
  }
  return chunk.map(([key, path], index) => {
    const response = responses[index]
    if (!response) throw new Error(`Unreachable: no $batch response for ${key}`)
    return [key, subResponseResult(response, graphUrl(path), schema)]
  })
}

/**
 * GETs one Graph path per key through `$batch`, keeping each key's result. Each POST of up to
 * `GRAPH_BATCH_MAX` lookups settles on its own, so one failed POST doesn't discard the others.
 */
async function loadBatch<T>(
  client: HttpClient,
  paths: ReadonlyMap<string, string>,
  schema: z.ZodType<T>,
  options: LoadOptions,
): Promise<BatchResults<T>> {
  const entries = [...paths]
  const chunks: (readonly [string, string])[][] = []
  for (let i = 0; i < entries.length; i += GRAPH_BATCH_MAX) {
    chunks.push(entries.slice(i, i + GRAPH_BATCH_MAX))
  }
  const settled = await Promise.all(
    chunks.map((chunk) => loadChunk(client, chunk, schema, options)),
  )
  return new Map(settled.flat())
}

/** GETs one Graph path per key through `$batch`. The map's keys are the caller's own. */
export function batchGet<T>(
  client: HttpClient,
  paths: ReadonlyMap<string, string>,
  schema: z.ZodType<T>,
  options: LoadOptions = {},
): Promise<ResourceResult<BatchResults<T>>> {
  return settle(() => loadBatch(client, paths, schema, options))
}

/**
 * Service principals by object ID, e.g. every service principal in `appRoleAssignedTo`, to get
 * their `appId` and type (application or managed identity). An invalid ID settles the whole batch
 * as `invalid-request` before anything is sent.
 */
export function getServicePrincipalsByIds(
  client: HttpClient,
  ids: Iterable<string>,
  options: LoadOptions = {},
): Promise<ResourceResult<BatchResults<GraphServicePrincipal>>> {
  return settle(() => {
    const paths = new Map([...new Set(ids)].map((id) => [id, graphPaths.servicePrincipalById(id)]))
    return loadBatch(client, paths, servicePrincipalSchema, options)
  })
}
