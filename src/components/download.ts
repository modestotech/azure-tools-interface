/** File exports. Nothing leaves the browser: each file is built locally and offered for download. */

function download(fileName: string, type: string, content: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Revoked after the click has been handled; revoking at once can cancel the download.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export function downloadJson(fileName: string, data: unknown): void {
  download(fileName, 'application/json', JSON.stringify(data, null, 2))
}

/** Characters a spreadsheet reads as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/

/**
 * One CSV field: quoted when needed, and prefixed with `'` when it would start a formula, since
 * values come from policy XML and Entra and could otherwise run in a spreadsheet.
 */
export function csvField(value: string | number): string {
  if (typeof value === 'number') return String(value)
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** CSV with a header row from the first record's keys. */
export function toCsv(rows: readonly Readonly<Record<string, string | number>>[]): string {
  const first = rows[0]
  if (!first) return ''
  const columns = Object.keys(first)
  const lines = [
    columns.map(csvField).join(','),
    ...rows.map((row) => columns.map((column) => csvField(row[column] ?? '')).join(',')),
  ]
  return `${lines.join('\r\n')}\r\n`
}

export function downloadCsv(
  fileName: string,
  rows: readonly Readonly<Record<string, string | number>>[],
): void {
  download(fileName, 'text/csv', toCsv(rows))
}
