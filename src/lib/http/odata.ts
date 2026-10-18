/**
 * URL helpers for ARM paths and Graph query strings. Values in paths and `$filter` come from policy
 * XML (backend ids, audiences, resources), so they are always checked and escaped here, never
 * interpolated by hand.
 */

import type { ApiKind } from '@/lib/token'
import { HttpError } from './errors'

/**
 * One URL path segment, such as an API, operation or backend id. Rejects values that could change
 * which resource is addressed (`.`, `..`, `/`, `\`, `?`, `#`, control characters) and percent-encodes
 * the rest.
 */
export function encodePathSegment(api: ApiKind, value: string): string {
  // eslint-disable-next-line no-control-regex
  if (value === '' || value === '.' || value === '..' || /[/\\?#\u0000-\u001f\u007f]/.test(value)) {
    throw new HttpError(
      'invalid-request',
      api,
      'Refused an ID that is not a single URL path segment.',
    )
  }
  return encodeURIComponent(value)
}

/** An OData string literal: single-quoted, with embedded quotes doubled (`O'Brien` → `'O''Brien'`). */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Appends query parameters to a URL. Values are percent-encoded; keys such as `$filter` and
 * `api-version` are kept as written. `undefined` values are skipped.
 */
export function withQuery(
  url: string,
  params: Readonly<Record<string, string | undefined>>,
): string {
  const query = Object.entries(params)
    .flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${encodeURIComponent(value)}`]))
    .join('&')
  if (!query) return url
  return `${url}${url.includes('?') ? '&' : '?'}${query}`
}
