/**
 * OData helpers for Graph query strings. Values in `$filter` come from policy XML (audiences,
 * resources), so they are always quoted and escaped here, never interpolated by hand.
 */

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
