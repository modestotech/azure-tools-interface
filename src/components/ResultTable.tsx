import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Download } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { downloadCsv, downloadJson } from '@/components/download'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  cellText,
  compareValues,
  exportRows,
  type ResultColumn,
  type ResultValue,
} from './resultRows'

interface ResultTableProps {
  readonly columns: readonly ResultColumn[]
  readonly rows: readonly Readonly<Record<string, ResultValue>>[]
  /** Export file name without extension. */
  readonly fileName: string
  /** Shown instead of the table when there are no rows. */
  readonly emptyText: string
}

type Sort = { readonly key: string; readonly desc: boolean } | undefined

/**
 * A generic, sortable, virtualized table of results with CSV/JSON export. Knows nothing about
 * the domain: scripts (and anything else producing rows) render through it.
 */
export function ResultTable({ columns, rows, fileName, emptyText }: ResultTableProps) {
  const [sort, setSort] = useState<Sort>()
  const sorted = useMemo(() => {
    if (!sort) return rows
    const order = sort.desc ? -1 : 1
    return [...rows].sort((a, b) => order * compareValues(a[sort.key], b[sort.key]))
  }, [rows, sort])
  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key !== key ? { key, desc: false } : current.desc ? undefined : { key, desc: true },
    )
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  // The virtualizer's functions change identity on every render; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)

  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{emptyText}</p>
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">{rows.length} rows</span>
        <span className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadCsv(`${fileName}.csv`, exportRows(columns, sorted))
            }}
          >
            <Download /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadJson(`${fileName}.json`, exportRows(columns, sorted))
            }}
          >
            <Download /> JSON
          </Button>
        </span>
      </div>
      <div ref={scrollRef} className="max-h-[60vh] overflow-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              {columns.map((column) => {
                const direction =
                  sort?.key === column.key ? (sort.desc ? 'desc' : 'asc') : undefined
                return (
                  <th
                    key={column.key}
                    className="px-3 py-2 font-medium"
                    aria-sort={
                      direction === 'asc'
                        ? 'ascending'
                        : direction === 'desc'
                          ? 'descending'
                          : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="flex items-center gap-1"
                      onClick={() => {
                        toggleSort(column.key)
                      }}
                    >
                      {column.title}
                      {direction === 'asc' && <ArrowUp className="size-3" />}
                      {direction === 'desc' && <ArrowDown className="size-3" />}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: `${String(padTop)}px` }} />
              </tr>
            )}
            {items.map((item) => {
              const row = sorted[item.index]
              if (!row) return null
              return (
                <tr
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="border-t align-top"
                >
                  {columns.map((column) => {
                    const text = cellText(row[column.key])
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          'px-3 py-2 break-words',
                          text.includes('\n') && 'font-mono text-xs whitespace-pre-wrap',
                        )}
                      >
                        {text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {padBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: `${String(padBottom)}px` }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
