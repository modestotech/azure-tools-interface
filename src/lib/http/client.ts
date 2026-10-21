import { z } from 'zod'
import {
  API_RESOURCES,
  checkToken,
  decodeJwt,
  isBlockingWarning,
  type ApiKind,
  type TokenClaims,
} from '@/lib/token'
import {
  forbiddenError,
  HttpError,
  notFoundError,
  tokenExpiredError,
  unauthorizedError,
} from './errors'
import { createLimiter } from './limiter'
import { clearMaskCache, maskText, type MaskValues } from './mask'
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
  /**
   * Time limit for one attempt, from leaving the limiter queue until the body is read. Time spent
   * queued doesn't count. Default 30 s.
   */
  requestTimeoutMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

export interface RequestOptions {
  signal?: AbortSignal | undefined
  /** TanStack Query key the request belongs to, shown (masked) in the log. */
  queryKey?: readonly unknown[] | undefined
}

/** Request options with a Zod schema the response must match before the request counts as `ok`. */
export interface ValidatedRequestOptions<T> extends RequestOptions {
  /**
   * For `getAllPages`, the schema of one item. A mismatch fails the request as `invalid-response`
   * and its log entry finishes as `error`.
   */
  schema: z.ZodType<T>
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
  /**
   * GET one resource; returns parsed JSON. `services/` pass a `schema`, so a response of the wrong
   * shape is logged as an error rather than `ok`.
   */
  getJson(api: ApiKind, url: string, options?: RequestOptions): Promise<unknown>
  getJson<T>(api: ApiKind, url: string, options: ValidatedRequestOptions<T>): Promise<T>
  /**
   * Like `getJson`, but a 404 resolves to `null` and is logged as `empty`, not as an error.
   * For resources whose absence is a normal answer, e.g. "no policy at that scope".
   */
  getJsonOrNull(api: ApiKind, url: string, options?: RequestOptions): Promise<unknown>
  getJsonOrNull<T>(
    api: ApiKind,
    url: string,
    options: ValidatedRequestOptions<T>,
  ): Promise<T | null>
  /**
   * GET a collection, following `nextLink` (ARM) / `@odata.nextLink` (Graph); returns all `value`
   * items. With a `schema`, every item is validated as part of its page.
   */
  getAllPages(api: ApiKind, url: string, options?: RequestOptions): Promise<unknown[]>
  getAllPages<T>(api: ApiKind, url: string, options: ValidatedRequestOptions<T>): Promise<T[]>
  /**
   * Graph `$batch` of GETs, chunked by 20. Sub-requests answering 429 / 503 are retried. Returns exactly one
   * response per request, in request order. Ids must be unique; a response missing from Graph's answer
   * is an `invalid-response` error, never silently dropped.
   */
  batch(requests: readonly BatchRequest[], options?: RequestOptions): Promise<BatchResponse[]>
  /** Forgets anything derived from the session (decoded claims, cached mask IDs). Called by "Clear session". */
  reset(): void
}

const MAX_PAGES = 1000

/** Accepts any JSON; used when the caller passes no schema. */
const ANY_JSON = z.unknown()

function schemaOf<T>(options: { schema?: z.ZodType<T> | undefined }): z.ZodType<T> {
  // Without a schema the overloads type the result as `unknown`, so treating any JSON as T is sound.
  return options.schema ?? (ANY_JSON as z.ZodType<T>)
}

function pageSchemaOf<T>(item: z.ZodType<T>) {
  return z.looseObject({
    value: z.array(item),
    nextLink: z.string().nullish(),
    '@odata.nextLink': z.string().nullish(),
  })
}

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

/** The `$batch` shape, plus: every request sent in this POST has a sub-response. */
function batchResponseSchemaFor(sent: readonly BatchRequest[]) {
  return batchResponseSchema.superRefine((data, ctx) => {
    const answered = new Set(data.responses.map((response) => response.id))
    const missing = sent.filter((request) => !answered.has(request.id)).length
    if (missing > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `$batch response is missing ${String(missing)} of ${String(sent.length)} sub-responses.`,
      })
    }
  })
}

/** Log label for a finished `$batch` POST, e.g. `$batch ×12 · 3 failed`. */
function batchLabel(sent: number, statuses: readonly number[]): string {
  const failed = statuses.filter((status) => status >= 400).length
  const label = `$batch ×${String(sent)}`
  return failed > 0 ? `${label} · ${String(failed)} failed` : label
}

/** A short description of why a response failed its schema. Masked by the caller. */
function schemaMismatch(error: z.ZodError): string {
  const issue = error.issues[0]
  const at = issue && issue.path.length > 0 ? ` at ${issue.path.map(String).join('.')}` : ''
  return `Unexpected response shape${at}: ${issue?.message ?? 'invalid'}`
}

const errorBodySchema = z.looseObject({
  error: z.looseObject({ code: z.string().optional(), message: z.string().optional() }),
})

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/**
 * Why a fetch or body read rejected: the caller aborted, the attempt's time limit ran out
 * (`AbortSignal.timeout` rejects with a `TimeoutError`), or the network failed.
 */
function failureCause(
  error: unknown,
  callerSignal: AbortSignal | undefined,
): 'cancelled' | 'timeout' | 'network' {
  if (callerSignal?.aborted) return 'cancelled'
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout'
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
  return 'network'
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
  const requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  const limiter = createLimiter(config.maxConcurrency ?? 8)
  const { logger } = config

  const mask = (text: string) => maskText(text, config.getMaskValues())

  // Decoded claims of the last token seen per API, so the JWT isn't decoded on every request.
  const decodedCache = new Map<ApiKind, { token: string; claims: TokenClaims | undefined }>()

  function claimsOf(api: ApiKind, token: string): TokenClaims | undefined {
    const cached = decodedCache.get(api)
    if (cached?.token === token) return cached.claims
    const decoded = decodeJwt(token)
    const claims = decoded.ok ? decoded.claims : undefined
    decodedCache.set(api, { token, claims })
    return claims
  }

  /**
   * Returns the token for `api`, or throws before anything is sent when it's missing, for the wrong
   * API, or expired. Uses the same checks as the token screen (`checkToken`); warnings that don't
   * make Azure reject the call (tenant mismatch, expiring soon) don't block.
   */
  function requireValidToken(api: ApiKind): string {
    const token = config.getToken(api)
    if (!token) {
      throw new HttpError('no-token', api, `No ${API_RESOURCES[api].label} token entered.`)
    }
    const claims = claimsOf(api, token)
    const blocking = claims ? checkToken({ api, claims }).find(isBlockingWarning) : undefined
    if (!claims || blocking?.kind === 'wrong-audience') {
      throw new HttpError(
        'audience-mismatch',
        api,
        `The ${API_RESOURCES[api].label} token is not valid for ${API_RESOURCES[api].resource}. Paste a token from the ${API_RESOURCES[api].label} az command.`,
      )
    }
    if (blocking?.kind === 'expired') {
      throw tokenExpiredError(api, config.getMaskValues().tenantId)
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
        `Blocked request to ${mask(url)}: ${API_RESOURCES[api].label} requests must go to ${API_RESOURCES[api].origin}.`,
      )
    }
  }

  interface SendExtra<T> {
    /** The parsed JSON must match it, or the request fails as `invalid-response`. */
    schema: z.ZodType<T>
    /** Extra text for the log line, e.g. `$batch ×12`. */
    label?: string
    /** Log label once the response is validated; replaces `label`. */
    finishLabel?: (data: T) => string
    /** Resolve a 404 to this value and log it as `empty` instead of failing. */
    notFound?: { value: T }
    /** Shared retry budget; defaults to a fresh one with `maxRetries`. */
    retryBudget?: RetryBudget
  }

  interface SendResult<T> {
    json: T
    headers: Headers
  }

  function fetchOnce(
    method: HttpMethod,
    url: string,
    token: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    return limiter.run(() => {
      // The clock starts here, once a slot is free. The response body reads under the same signal.
      const timeout = AbortSignal.timeout(requestTimeoutMs)
      return fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? null : JSON.stringify(body),
        // ARM and Graph answer API calls directly. A redirect would send the request (and, for a
        // same-origin hop, the token) somewhere the host check never saw, so it fails as a network error.
        redirect: 'error',
        credentials: 'omit',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    }, signal)
  }

  /** Maps a non-OK response (after retries) to the matching typed error. */
  function toHttpError(api: ApiKind, response: Response, text: string, maskedUrl: string) {
    const detail = mask(errorDetail(response.status, response.statusText, text))
    switch (response.status) {
      case 401:
        return unauthorizedError(api, maskedUrl, config.getMaskValues().tenantId, detail)
      case 403:
        return forbiddenError(api, maskedUrl, detail)
      case 404:
        return notFoundError(api, maskedUrl, detail)
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

  function timeoutError(api: ApiKind, maskedUrl: string): HttpError {
    return new HttpError(
      'timeout',
      api,
      `No complete response from ${maskedUrl} within ${String(requestTimeoutMs / 1000)} s.`,
      { url: maskedUrl },
    )
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

  /**
   * Guards, logs and sends one request, retrying 429 / 503 within the budget. The log entry finishes
   * as `ok` only once the response has passed `extra.schema`.
   */
  async function send<T>(
    api: ApiKind,
    method: HttpMethod,
    url: string,
    body: unknown,
    options: RequestOptions,
    extra: SendExtra<T>,
  ): Promise<SendResult<T>> {
    assertReadOnly(api, method, url, body)
    assertHost(api, url)
    const token = requireValidToken(api)
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
      logger.finish(id, {
        state: 'error',
        status,
        bytes,
        error: error.message,
        errorKind: error.kind,
      })
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
      const cause = failureCause(error, options.signal)
      if (cause === 'cancelled') {
        logger.finish(id, { state: 'cancelled' })
        throw error
      }
      return fail(cause === 'timeout' ? timeoutError(api, maskedUrl) : networkError(api, maskedUrl))
    }

    let text: string
    try {
      text = await response.text()
    } catch (error) {
      const cause = failureCause(error, options.signal)
      if (cause === 'cancelled') {
        logger.finish(id, { state: 'cancelled' })
        throw error
      }
      const failure =
        cause === 'timeout' ? timeoutError(api, maskedUrl) : networkError(api, maskedUrl)
      return fail(failure, response.status)
    }
    const bytes = new TextEncoder().encode(text).byteLength

    if (response.status === 404 && extra.notFound) {
      logger.finish(id, { state: 'empty', status: 404, bytes })
      return { json: extra.notFound.value, headers: response.headers }
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
    const parsed = extra.schema.safeParse(json)
    if (!parsed.success) {
      const error = new HttpError('invalid-response', api, mask(schemaMismatch(parsed.error)), {
        status: response.status,
        url: maskedUrl,
      })
      return fail(error, response.status, bytes)
    }
    logger.finish(id, {
      state: 'ok',
      status: response.status,
      bytes,
      label: extra.finishLabel?.(parsed.data),
    })
    return { json: parsed.data, headers: response.headers }
  }

  type CallOptions<T> = RequestOptions & { schema?: z.ZodType<T> | undefined }

  async function getJson<T>(api: ApiKind, url: string, options: CallOptions<T> = {}) {
    const extra = { schema: schemaOf(options) }
    return (await send(api, 'GET', url, undefined, options, extra)).json
  }

  async function getJsonOrNull<T>(api: ApiKind, url: string, options: CallOptions<T> = {}) {
    const extra = { schema: schemaOf(options).nullable(), notFound: { value: null } }
    return (await send(api, 'GET', url, undefined, options, extra)).json
  }

  async function getAllPages<T>(api: ApiKind, url: string, options: CallOptions<T> = {}) {
    const pageSchema = pageSchemaOf(schemaOf(options))
    const items: T[] = []
    let next: string | null | undefined = url
    for (let page = 0; next; page++) {
      if (page >= MAX_PAGES) {
        throw new HttpError('invalid-response', api, `Stopped after ${String(MAX_PAGES)} pages.`)
      }
      const json: z.output<typeof pageSchema> = await getJson(api, next, {
        ...options,
        schema: pageSchema,
      })
      items.push(...json.value)
      next = json.nextLink ?? json['@odata.nextLink']
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
      const sent = pending.length
      const { json } = await send('graph', 'POST', GRAPH_BATCH_URL, body, options, {
        schema: batchResponseSchemaFor(pending),
        label: batchLabel(sent, []),
        finishLabel: (data) =>
          batchLabel(
            sent,
            data.responses.map((r) => r.status),
          ),
        retryBudget,
      })
      let wait = 0
      const retry: BatchRequest[] = []
      const pendingById = new Map(pending.map((p) => [p.id, p]))
      for (const r of json.responses) {
        const request = pendingById.get(r.id)
        if (!request) continue
        if (isRetryableStatus(r.status) && retryBudget.left > 0) {
          retry.push(request)
          wait = Math.max(wait, retryDelayMs(headerValue(r.headers, 'Retry-After'), attempt))
        } else {
          results.set(r.id, { id: r.id, status: r.status, body: r.body })
        }
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

  function reset() {
    decodedCache.clear()
    clearMaskCache()
  }

  return { getJson, getJsonOrNull, getAllPages, batch, reset }
}
