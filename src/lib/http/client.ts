import { z } from 'zod'
import { API_RESOURCES, decodeJwt, isExpectedAudience, type ApiKind } from '@/lib/token'
import { ForbiddenError, HttpError, NotFoundError, UnauthorizedError } from './errors'
import { createLimiter } from './limiter'
import { maskText, type MaskValues } from './mask'
import { assertReadOnly, GRAPH_BATCH_MAX, GRAPH_BATCH_URL, type HttpMethod } from './readOnly'
import type { RequestLogger } from './requestLog'
import { defaultSleep, isRetryableStatus, retryDelayMs, type RetryBudget } from './retry'

export { parseRetryAfter } from './retry'

export interface HttpClientConfig {
  /** Current token for the API, or undefined when none is entered. Read on every request. */
  getToken(api: ApiKind): string | undefined
  /** Current subscription / tenant IDs, used to mask URLs and messages. */
  getMaskValues(): MaskValues
  logger: RequestLogger
  fetch?: typeof fetch
  /** Requests in flight across both APIs. Default 8. */
  maxConcurrency?: number
  /** Retries on 429 / 503 per request (a `$batch` chunk shares one budget). Default 3. */
  maxRetries?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export interface RequestOptions {
  signal?: AbortSignal | undefined
  /** TanStack Query key the request belongs to, shown (masked) in the log. */
  queryKey?: readonly unknown[] | undefined
}

export interface BatchRequest {
  readonly id: string
  /** Path relative to the Graph `baseUrl` (`/v1.0`), starting with `/`. */
  readonly url: string
}

export interface BatchResponse {
  readonly id: string
  readonly status: number
  readonly body: unknown
}

export interface HttpClient {
  /** GET one resource; returns parsed JSON. Validate it with Zod in `services/`. */
  getJson(api: ApiKind, url: string, options?: RequestOptions): Promise<unknown>
  /**
   * Like `getJson`, but a 404 resolves to `null` and is logged as `empty`, not as an error.
   * For resources whose absence is a normal answer, e.g. "no policy at that scope".
   */
  getJsonOrNull(api: ApiKind, url: string, options?: RequestOptions): Promise<unknown>
  /** GET a collection, following `nextLink` (ARM) / `@odata.nextLink` (Graph); returns all `value` items. */
  getAllPages(api: ApiKind, url: string, options?: RequestOptions): Promise<unknown[]>
  /**
   * Graph `$batch` of GETs, chunked by 20. Sub-requests answering 429 / 503 are retried. Returns exactly one
   * response per request, in request order. Ids must be unique; a response missing from Graph's answer
   * is an `invalid-response` error, never silently dropped.
   */
  batch(requests: readonly BatchRequest[], options?: RequestOptions): Promise<BatchResponse[]>
}

const MAX_PAGES = 1000

const pageSchema = z.looseObject({
  value: z.array(z.unknown()),
  nextLink: z.string().nullish(),
  '@odata.nextLink': z.string().nullish(),
})

const batchResponseSchema = z.object({
  responses: z.array(
    z.looseObject({
      id: z.string(),
      status: z.number(),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.unknown().optional(),
    }),
  ),
})

const errorBodySchema = z.looseObject({
  error: z.looseObject({ code: z.string().optional(), message: z.string().optional() }),
})

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError')
}

/** Case-insensitive lookup in a `$batch` sub-response's plain headers object. */
function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  const lower = name.toLowerCase()
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === lower)?.[1]
}

function errorDetail(status: number, statusText: string, text: string): string {
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(text))
    if (parsed.success) {
      const { code, message } = parsed.data.error
      const joined = [code, message].filter(Boolean).join(': ')
      if (joined) return joined
    }
  } catch {
    // Not JSON; fall through.
  }
  return `HTTP ${String(status)}${statusText ? ` ${statusText}` : ''}`
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  // Look fetch up on every call, never capture it: test mocks (MSW) patch globalThis.fetch after modules load.
  const fetchImpl: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const sleep = config.sleep ?? defaultSleep
  const maxRetries = config.maxRetries ?? 3
  const limiter = createLimiter(config.maxConcurrency ?? 8)
  const { logger } = config

  const mask = (text: string) => maskText(text, config.getMaskValues())

  /** Rejects a missing token, or one for the wrong API, before any request is sent. */
  function tokenFor(api: ApiKind): string {
    const token = config.getToken(api)
    if (!token) {
      throw new HttpError('no-token', api, `No ${api.toUpperCase()} token entered.`)
    }
    const decoded = decodeJwt(token)
    if (!decoded.ok || !isExpectedAudience(api, decoded.claims.aud)) {
      throw new HttpError(
        'audience-mismatch',
        api,
        `The ${api.toUpperCase()} token is not valid for ${API_RESOURCES[api].resource}. Paste a token from the ${api.toUpperCase()} az command.`,
      )
    }
    return token
  }

  function assertHost(api: ApiKind, url: string): void {
    let origin: string
    try {
      origin = new URL(url).origin
    } catch {
      origin = ''
    }
    if (origin !== API_RESOURCES[api].origin) {
      throw new HttpError(
        'disallowed-host',
        api,
        `Blocked request to ${mask(url)}: ${api.toUpperCase()} requests must go to ${API_RESOURCES[api].origin}.`,
      )
    }
  }

  interface SendExtra {
    /** Extra text for the log line, e.g. `$batch ×12`. */
    label?: string
    /** Resolve a 404 to `null` and log it as `empty` instead of failing. */
    notFoundIsEmpty?: boolean
    /** Shared retry budget; defaults to a fresh one with `maxRetries`. */
    retryBudget?: RetryBudget
  }

  interface SendResult {
    json: unknown
    headers: Headers
  }

  function fetchOnce(
    method: HttpMethod,
    url: string,
    token: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    return limiter.run(() =>
      fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? null : JSON.stringify(body),
        signal: signal ?? null,
      }),
    )
  }

  /** Maps a non-OK response (after retries) to the matching typed error. */
  function toHttpError(api: ApiKind, response: Response, text: string, maskedUrl: string) {
    const detail = mask(errorDetail(response.status, response.statusText, text))
    switch (response.status) {
      case 401:
        return new UnauthorizedError(api, maskedUrl, config.getMaskValues().tenantId, detail)
      case 403:
        return new ForbiddenError(api, maskedUrl, detail)
      case 404:
        return new NotFoundError(api, maskedUrl, detail)
      default:
        return new HttpError(
          isRetryableStatus(response.status) ? 'throttled' : 'http',
          api,
          detail,
          {
            status: response.status,
            url: maskedUrl,
          },
        )
    }
  }

  function networkError(api: ApiKind, maskedUrl: string): HttpError {
    // fetch() rejects with a TypeError on network failures, including CORS blocks.
    return new HttpError(
      'network',
      api,
      `Network error calling ${maskedUrl}. Check the connection; if it persists, the call may be blocked by CORS.`,
      { url: maskedUrl },
    )
  }

  /** Guards, logs and sends one request, retrying 429 / 503 within the budget. */
  async function send(
    api: ApiKind,
    method: HttpMethod,
    url: string,
    body: unknown,
    options: RequestOptions,
    extra: SendExtra = {},
  ): Promise<SendResult> {
    assertReadOnly(api, method, url, body)
    assertHost(api, url)
    const token = tokenFor(api)
    const maskedUrl = mask(url)
    const budget = extra.retryBudget ?? { left: maxRetries }

    const id = logger.start({
      api,
      method,
      url: maskedUrl,
      rawUrl: url,
      label: extra.label,
      queryKey: options.queryKey ? mask(JSON.stringify(options.queryKey)) : undefined,
    })

    const fail = (error: HttpError, status?: number, bytes?: number): never => {
      logger.finish(id, { state: 'error', status, bytes, error: error.message })
      throw error
    }

    let response: Response
    try {
      for (let attempt = 0; ; attempt++) {
        response = await fetchOnce(method, url, token, body, options.signal)
        if (!isRetryableStatus(response.status) || budget.left <= 0) break
        budget.left--
        logger.retry(id, response.status)
        await sleep(retryDelayMs(response.headers.get('Retry-After'), attempt), options.signal)
      }
    } catch (error) {
      if (isAbort(error, options.signal)) {
        logger.finish(id, { state: 'cancelled' })
        throw error
      }
      return fail(networkError(api, maskedUrl))
    }

    let text: string
    try {
      text = await response.text()
    } catch (error) {
      if (isAbort(error, options.signal)) {
        logger.finish(id, { state: 'cancelled' })
        throw error
      }
      return fail(networkError(api, maskedUrl), response.status)
    }
    const bytes = new TextEncoder().encode(text).byteLength

    if (response.status === 404 && extra.notFoundIsEmpty) {
      logger.finish(id, { state: 'empty', status: 404, bytes })
      return { json: null, headers: response.headers }
    }
    if (!response.ok) {
      return fail(toHttpError(api, response, text, maskedUrl), response.status, bytes)
    }

    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        const error = new HttpError('invalid-response', api, 'Response was not valid JSON.', {
          status: response.status,
          url: maskedUrl,
        })
        return fail(error, response.status, bytes)
      }
    }
    logger.finish(id, { state: 'ok', status: response.status, bytes })
    return { json, headers: response.headers }
  }

  async function getJson(api: ApiKind, url: string, options: RequestOptions = {}) {
    return (await send(api, 'GET', url, undefined, options)).json
  }

  async function getJsonOrNull(api: ApiKind, url: string, options: RequestOptions = {}) {
    return (await send(api, 'GET', url, undefined, options, { notFoundIsEmpty: true })).json
  }

  async function getAllPages(api: ApiKind, url: string, options: RequestOptions = {}) {
    const items: unknown[] = []
    let next: string | null | undefined = url
    for (let page = 0; next; page++) {
      if (page >= MAX_PAGES) {
        throw new HttpError('invalid-response', api, `Stopped after ${String(MAX_PAGES)} pages.`)
      }
      const json = await getJson(api, next, options)
      const parsed = pageSchema.safeParse(json)
      if (!parsed.success) {
        throw new HttpError('invalid-response', api, `Expected a collection from ${mask(next)}.`)
      }
      items.push(...parsed.data.value)
      next = parsed.data.nextLink ?? parsed.data['@odata.nextLink']
    }
    return items
  }

  async function batchChunk(
    chunk: readonly BatchRequest[],
    options: RequestOptions,
  ): Promise<BatchResponse[]> {
    const results = new Map<string, BatchResponse>()
    const retryBudget: RetryBudget = { left: maxRetries }
    let pending = chunk
    for (let attempt = 0; pending.length > 0; attempt++) {
      const body = { requests: pending.map((r) => ({ id: r.id, method: 'GET', url: r.url })) }
      const label = `$batch ×${String(pending.length)}`
      const { json } = await send('graph', 'POST', GRAPH_BATCH_URL, body, options, {
        label,
        retryBudget,
      })
      const parsed = batchResponseSchema.safeParse(json)
      if (!parsed.success) {
        throw new HttpError('invalid-response', 'graph', 'Unexpected $batch response shape.')
      }
      let wait = 0
      const retry: BatchRequest[] = []
      const pendingById = new Map(pending.map((p) => [p.id, p]))
      for (const r of parsed.data.responses) {
        const request = pendingById.get(r.id)
        if (!request) continue
        if (isRetryableStatus(r.status) && retryBudget.left > 0) {
          retry.push(request)
          wait = Math.max(wait, retryDelayMs(headerValue(r.headers, 'Retry-After'), attempt))
        } else {
          results.set(r.id, { id: r.id, status: r.status, body: r.body })
        }
      }
      const missing = pending.filter((p) => !results.has(p.id) && !retry.includes(p))
      if (missing.length > 0) {
        throw new HttpError(
          'invalid-response',
          'graph',
          `$batch response is missing ${String(missing.length)} of ${String(pending.length)} sub-responses.`,
        )
      }
      pending = retry
      if (pending.length > 0) {
        retryBudget.left--
        await sleep(wait, options.signal)
      }
    }
    return chunk.map((r) => {
      const response = results.get(r.id)
      if (!response) throw new Error(`Unreachable: no $batch response for ${r.id}`)
      return response
    })
  }

  async function batch(requests: readonly BatchRequest[], options: RequestOptions = {}) {
    if (new Set(requests.map((r) => r.id)).size !== requests.length) {
      throw new HttpError('invalid-request', 'graph', '$batch request ids must be unique.')
    }
    const chunks: BatchRequest[][] = []
    for (let i = 0; i < requests.length; i += GRAPH_BATCH_MAX) {
      chunks.push(requests.slice(i, i + GRAPH_BATCH_MAX))
    }
    const results = await Promise.all(chunks.map((c) => batchChunk(c, options)))
    return results.flat()
  }

  return { getJson, getJsonOrNull, getAllPages, batch }
}
