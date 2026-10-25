/** Values in a ResultTable: their text, their order, and their export form. Pure. */

export type ResultValue = string | number | boolean | undefined

export interface ResultColumn {
  readonly key: string
  readonly title: string
}

export function cellText(value: ResultValue): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

/** Numbers by value, everything else as text; empty cells last. */
export function compareValues(a: ResultValue, b: ResultValue): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return cellText(a).localeCompare(cellText(b))
}

/** Rows as plain strings and numbers, in column order, for CSV and JSON. */
export function exportRows(
  columns: readonly ResultColumn[],
  rows: readonly Readonly<Record<string, ResultValue>>[],
): Record<string, string | number>[] {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map(({ key }) => {
        const value = row[key]
        return [key, typeof value === 'number' ? value : cellText(value)]
      }),
    ),
  )
}
