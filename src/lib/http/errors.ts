import { API_RESOURCES, azTokenCommand, type ApiKind } from '@/lib/token'

export type HttpErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'throttled'
  | 'unexpected-status'
  | 'network'
  | 'timeout'
  | 'invalid-request'
  | 'invalid-response'
  | 'no-token'
  | 'invalid-token'
  | 'audience-mismatch'
  | 'token-expired'
  | 'read-only-violation'
  | 'disallowed-host'

/**
 * Every error the HTTP layer throws. There are no subclasses: tell errors apart by `kind`
 * (`isHttpError(error, 'forbidden')`), never with `instanceof`.
 *
 * Messages and URLs are already masked: they never contain tokens, and subscription / tenant IDs
 * appear as `{sub}` / `{tid}`.
 */
export class HttpError extends Error {
  override readonly name = 'HttpError'
  readonly kind: HttpErrorKind
  readonly api: ApiKind
  readonly status: number | undefined
  /** Masked URL of the failing request, if one was made. */
  readonly url: string | undefined
  /**
   * For `unauthorized` / `token-expired`: the exact az command to copy for a fresh token. It holds the
   * real tenant ID so it can be run as is; show it on screen only, never log it.
   */
  readonly azCommand: string | undefined

  constructor(
    kind: HttpErrorKind,
    api: ApiKind,
    message: string,
    details: {
      status?: number | undefined
      url?: string | undefined
      azCommand?: string | undefined
    } = {},
  ) {
    super(message)
    this.kind = kind
    this.api = api
    this.status = details.status
    this.url = details.url
    this.azCommand = details.azCommand
  }
}

/** 401: token expired or wrong audience. Carries the exact az command to copy. */
export function unauthorizedError(
  api: ApiKind,
  url: string,
  tenantId: string | undefined,
  detail: string,
): HttpError {
  return new HttpError(
    'unauthorized',
    api,
    `Token expired or wrong audience — re-run the az command to get a new ${API_RESOURCES[api].label} token. (${detail})`,
    { status: 401, url, azCommand: azTokenCommand(api, tenantId) },
  )
}

/** Expired token caught before sending. Carries the exact az command to copy. */
export function tokenExpiredError(api: ApiKind, tenantId: string | undefined): HttpError {
  return new HttpError(
    'token-expired',
    api,
    `The ${API_RESOURCES[api].label} token has expired — re-run the az command to get a new one.`,
    { azCommand: azTokenCommand(api, tenantId) },
  )
}

/** 403: the signed-in user lacks permission. Shown per resource; never a global failure. */
export function forbiddenError(api: ApiKind, url: string, detail: string): HttpError {
  return new HttpError('forbidden', api, `Access denied: ${detail}`, { status: 403, url })
}

/** 404. For policy endpoints this means "no policy at that scope"; use `getJsonOrNull` there. */
export function notFoundError(api: ApiKind, url: string, detail: string): HttpError {
  return new HttpError('not-found', api, `Not found: ${detail}`, { status: 404, url })
}

export function isHttpError(error: unknown, kind?: HttpErrorKind): error is HttpError {
  return error instanceof HttpError && (kind === undefined || error.kind === kind)
}
