import { API_RESOURCES } from '@/lib/token/resources'

/**
 * The second read-only guard, at the browser's own network APIs. The HTTP client already refuses
 * anything but reads (`assertReadOnly`); this wraps `fetch`, `XMLHttpRequest` and `sendBeacon`
 * themselves, so a request that doesn't go through the client (a bug, or a library) is refused
 * too. Deliberately independent of `readOnly.ts`: it shares none of its code, so one guard's bug
 * doesn't disable the other.
 *
 * Allowed: a GET without a body, and a POST to Graph `$batch` whose body is JSON with only GET
 * sub-requests (each exactly `{ id, method: 'GET', url }`, with a relative URL). Everything else is
 * refused before the browser sends it. In ARM-only mode (`setGraphAllowed(false)`), nothing may go
 * to Graph at all, so the only thing left is a GET to anywhere else, ARM included.
 */

const BATCH_URL = `${API_RESOURCES.graph.baseUrl}/$batch`
const GRAPH_ORIGIN = API_RESOURCES.graph.origin

/**
 * Whether Graph may be called: false in ARM-only mode. Module state on purpose: the guard is
 * installed before the app exists, and the session store keeps this in sync with the mode.
 * Starts false, so nothing reaches Graph before the session has said it may.
 */
let graphAllowed = false

export function setGraphAllowed(allowed: boolean): void {
  graphAllowed = allowed
}
const SUB_REQUEST_KEYS = ['id', 'method', 'url']

export class ReadOnlyViolation extends Error {
  override readonly name = 'ReadOnlyViolation'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function isGetSubRequest(value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  return (
    keys.length === SUB_REQUEST_KEYS.length &&
    keys.every((key, index) => key === SUB_REQUEST_KEYS[index]) &&
    value.method === 'GET' &&
    typeof value.url === 'string' &&
    value.url.startsWith('/') &&
    !value.url.startsWith('//')
  )
}

function isGetOnlyBatch(body: unknown): boolean {
  if (typeof body !== 'string') return false
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }
  if (!isRecord(parsed) || Object.keys(parsed).join() !== 'requests') return false
  const { requests } = parsed
  return Array.isArray(requests) && requests.length > 0 && requests.every(isGetSubRequest)
}

/** The URL's origin only: its path and query can hold subscription, tenant and object IDs. */
function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'an invalid URL'
  }
}

/**
 * Whether a request may leave the browser. `body` is what would be sent: undefined or null for
 * none. `allowGraph` false refuses anything to Graph. Pure.
 */
export function isReadOnlyRequest(
  method: string,
  url: string,
  body: unknown,
  allowGraph: boolean,
): boolean {
  if (!allowGraph && originOf(url) === GRAPH_ORIGIN) return false
  const verb = method.toUpperCase()
  if (verb === 'GET') return body === undefined || body === null
  return allowGraph && verb === 'POST' && url === BATCH_URL && isGetOnlyBatch(body)
}

/** What `fetch(input, init)` would send: method, URL and body. */
function describeFetch(input: RequestInfo | URL, init: RequestInit | undefined) {
  const request = input instanceof Request ? input : undefined
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? request?.method ?? 'GET'
  // A Request's own body is a stream that can't be read here without consuming it; the app never
  // sends one, so any Request carrying a body is refused.
  const body = init?.body ?? (request?.body ? request.body : undefined)
  return { method, url, body }
}

function violation(what: string, url: string): ReadOnlyViolation {
  return new ReadOnlyViolation(`Blocked ${what} to ${originOf(url)}: this app only sends reads.`)
}

/** The parts of the browser this guard wraps; `globalThis` in the app, a stand-in in tests. */
export interface GuardTarget {
  fetch: typeof fetch
  XMLHttpRequest?: typeof XMLHttpRequest
  navigator?: Pick<Navigator, 'sendBeacon'>
}

/** Marks a wrapper, so installing again (or after something replaced `fetch`) wraps only once. */
const GUARDED = Symbol.for('apim-access-mapper.network-guard')

type Marked<F> = F & { [GUARDED]?: true }

function mark<F extends object>(fn: F): F {
  return Object.assign(fn, { [GUARDED]: true as const })
}

const isGuarded = (fn: unknown) =>
  typeof fn === 'function' && (fn as Marked<object>)[GUARDED] === true

/**
 * Wraps the target's network APIs. Call before anything else runs: `src/readOnlyGuard.ts` is a
 * module script of its own, ahead of the app's in index.html. Each API already wrapped is left as
 * is, so calling again is safe, and re-wraps whatever replaced one since.
 */
export function installNetworkGuard(target: GuardTarget = globalThis): void {
  if (!isGuarded(target.fetch)) {
    const originalFetch = target.fetch.bind(target)
    target.fetch = mark((input: RequestInfo | URL, init?: RequestInit) => {
      const { method, url, body } = describeFetch(input, init)
      if (!isReadOnlyRequest(method, url, body, graphAllowed)) {
        const graphRefused = !graphAllowed && originOf(url) === GRAPH_ORIGIN
        const what = graphRefused
          ? 'a Graph request (ARM-only mode)'
          : `a ${method.toUpperCase()} request`
        const error = violation(what, url)
        console.error(error)
        return Promise.reject(error)
      }
      return originalFetch(input, init)
    })
  }

  const xhr = target.XMLHttpRequest?.prototype
  if (xhr && !isGuarded(Reflect.get(xhr, 'open'))) {
    // The app never uses XMLHttpRequest; only reads are let through in case a library does.
    // Called with Reflect.apply on each request object, so their `this` is the right one.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { open, send } = xhr
    const urls = new WeakMap<XMLHttpRequest, string>()
    xhr.open = mark(function (this: XMLHttpRequest, ...args: unknown[]) {
      const method = String(args[0])
      const url = String(args[1])
      if (method.toUpperCase() !== 'GET') throw violation(`a ${method.toUpperCase()} request`, url)
      if (!graphAllowed && originOf(url) === GRAPH_ORIGIN)
        throw violation('a Graph request (ARM-only mode)', url)
      urls.set(this, url)
      Reflect.apply(open, this, args)
    })
    xhr.send = mark(function (
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      if (body !== undefined && body !== null) {
        throw violation('a GET request with a body', urls.get(this) ?? '')
      }
      Reflect.apply(send, this, [body])
    })
  }

  // A beacon is always a POST.
  const navigator = target.navigator
  if (navigator?.sendBeacon && !isGuarded(navigator.sendBeacon)) {
    navigator.sendBeacon = mark((url: string | URL) => {
      console.error(violation('a beacon (POST)', String(url)))
      return false
    })
  }
}
