import { azTokenCommand, type ApiKind } from '@/lib/token'

export type HttpErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'throttled'
  | 'http'
  | 'network'
  | 'invalid-request'
  | 'invalid-response'
  | 'no-token'
  | 'audience-mismatch'
  | 'token-expired'
  | 'read-only-violation'
  | 'disallowed-host'

/**
 * Every error the HTTP layer throws. Messages and URLs are already masked: they never contain
 * tokens, and subscription / tenant IDs appear as `{sub}` / `{tid}`.
 */
export class HttpError extends Error {
  override readonly name: string = 'HttpError'
  readonly kind: HttpErrorKind
  readonly api: ApiKind
  readonly status: number | undefined
  /** Masked URL of the failing request, if one was made. */
  readonly url: string | undefined

  constructor(
    kind: HttpErrorKind,
    api: ApiKind,
    message: string,
    details: { status?: number | undefined; url?: string | undefined } = {},
  ) {
    super(message)
    this.kind = kind
    this.api = api
    this.status = details.status
    this.url = details.url
  }
}

/** 401: token expired or wrong audience. Carries the exact az command to copy. */
export class UnauthorizedError extends HttpError {
  override readonly name = 'UnauthorizedError'
  readonly azCommand: string

  constructor(api: ApiKind, url: string, tenantId: string | undefined, detail: string) {
    super(
      'unauthorized',
      api,
      `Token expired or wrong audience — re-run the az command to get a new ${api.toUpperCase()} token. (${detail})`,
      { status: 401, url },
    )
    this.azCommand = azTokenCommand(api, tenantId)
  }
}

/** 403: the signed-in user lacks permission. Shown per resource; never a global failure. */
export class ForbiddenError extends HttpError {
  override readonly name = 'ForbiddenError'
  constructor(api: ApiKind, url: string, detail: string) {
    super('forbidden', api, `Access denied: ${detail}`, { status: 403, url })
  }
}

/** 404. For policy endpoints this means "no policy at that scope", which callers treat as empty. */
export class NotFoundError extends HttpError {
  override readonly name = 'NotFoundError'
  constructor(api: ApiKind, url: string, detail: string) {
    super('not-found', api, `Not found: ${detail}`, { status: 404, url })
  }
}

export function isHttpError(error: unknown, kind?: HttpErrorKind): error is HttpError {
  return error instanceof HttpError && (kind === undefined || error.kind === kind)
}
