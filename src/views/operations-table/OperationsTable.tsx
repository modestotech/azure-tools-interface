import {
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  columnFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Download } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { downloadCsv, downloadJson } from '@/components/download'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ViewProps } from '../types'
import { OperationDetails } from './OperationDetails'
import { authText } from '../shared/summaries'
import {
  backendText,
  callersUnknownText,
  exportRow,
  operationRows,
  rowOutboundText,
  type OperationRow,
} from './rows'
import { SeverityBadge } from '@/components/SeverityBadge'

const features = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  globalFilteringFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  filterFns: { includesString: filterFn_includesString },
})

const column = createColumnHelper<typeof features, OperationRow>()

const SEVERITY_RANK = { high: 3, medium: 2, info: 1 } as const

const columns = column.columns([
  column.accessor('method', { header: 'Method', sortFn: 'alphanumeric' }),
  column.accessor('path', {
    header: 'Path',
    sortFn: 'alphanumeric',
    cell: (info) => (
      <span>
        <span className="font-mono">{info.getValue()}</span>
        <span className="text-muted-foreground block text-xs">{info.row.original.name}</span>
      </span>
    ),
  }),
  column.accessor((row) => authText(row.auth), {
    id: 'auth',
    header: 'Auth',
    sortFn: 'alphanumeric',
    cell: (info) => (
      <span
        className={cn(
          info.row.original.auth.kind === 'none' && 'text-destructive',
          info.row.original.auth.kind === 'unreadable' && 'text-muted-foreground',
        )}
      >
        {info.getValue()}
        {info.row.original.auth.kind === 'jwt' && (
          <span className="text-muted-foreground block text-xs">
            from {info.row.original.auth.scopes.join(', ')}
          </span>
        )}
      </span>
    ),
  }),
  // Unknown (ARM-only mode) sorts below zero.
  column.accessor((row) => row.callers ?? -1, {
    id: 'callers',
    header: 'Callers',
    sortFn: 'basic',
    cell: (info) =>
      info.row.original.callers ?? (
        <span className="text-muted-foreground">{callersUnknownText(info.row.original)}</span>
      ),
  }),
  column.accessor(backendText, {
    id: 'backend',
    header: 'Backend',
    sortFn: 'alphanumeric',
    cell: (info) => (
      <span className="break-all">
        {info.getValue()}
        {info.row.original.backendSource && (
          <span className="text-muted-foreground block text-xs">
            from {info.row.original.backendSource}
          </span>
        )}
      </span>
    ),
  }),
  column.accessor(rowOutboundText, {
    id: 'outbound',
    header: 'Outbound auth',
    sortFn: 'alphanumeric',
    cell: (info) => <span className="break-all">{info.getValue()}</span>,
  }),
  column.accessor((row) => (row.severity ? SEVERITY_RANK[row.severity] : 0), {
    id: 'findings',
    header: 'Findings',
    sortFn: 'basic',
    cell: (info) => {
      const row = info.row.original
      return (
        <span className="flex flex-wrap gap-1">
          {row.needsReview > 0 && (
            <SeverityBadge severity="medium">needs manual review</SeverityBadge>
          )}
          {row.severity && (
            <SeverityBadge severity={row.severity}>{row.findings.length} findings</SeverityBadge>
          )}
        </span>
      )
    },
  }),
])

function fileName(model: ViewProps['model'], extension: string): string {
  return `operations-${model.api.id}.${extension}`
}

/** Every operation of the API with its auth, callers, backend, outbound auth and findings. */
export default function OperationsTable({ model }: ViewProps) {
  const rows = useMemo(() => operationRows(model), [model])
  const [selectedId, setSelectedId] = useState<string>()
  const table = useTable({ features, columns, data: rows, globalFilterFn: 'includesString' })
  const visible = table.getRowModel().rows
  const selected = rows.find((row) => row.id === selectedId)
  const toggle = (id: string) => {
    setSelectedId(id === selectedId ? undefined : id)
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  // The virtualizer's functions change identity on every render; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  })
  const items = virtualizer.getVirtualItems()
  const padTop = items[0]?.start ?? 0
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Filter operations"
          placeholder="Filter operations…"
          className="max-w-xs"
          value={String(table.state.globalFilter ?? '')}
          onChange={(event) => {
            table.setGlobalFilter(event.target.value)
          }}
        />
        <span className="text-muted-foreground text-sm">
          {visible.length} of {rows.length} operations
          {model.pending.length > 0 && ' · loading…'}
        </span>
        <span className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadCsv(fileName(model, 'csv'), rows.map(exportRow))
            }}
          >
            <Download /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadJson(fileName(model, 'json'), rows.map(exportRow))
            }}
          >
            <Download /> JSON
          </Button>
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[60vh] overflow-auto rounded-md border"
        data-testid="operations-scroll"
      >
        <table className="w-full text-left text-sm">
          <thead className="bg-muted sticky top-0">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2 font-medium"
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {sorted === 'asc' && <ArrowUp className="size-3" />}
                        {sorted === 'desc' && <ArrowDown className="size-3" />}
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: `${String(padTop)}px` }} />
              </tr>
            )}
            {items.map((item) => {
              const row = visible[item.index]
              if (!row) return null
              const isSelected = row.original.id === selectedId
              return (
                <tr
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  aria-selected={isSelected}
                  className={cn(
                    'hover:bg-accent cursor-pointer border-t align-top',
                    isSelected && 'bg-accent',
                  )}
                  tabIndex={0}
                  onClick={() => {
                    toggle(row.original.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    toggle(row.original.id)
                  }}
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
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
        {rows.length === 0 && (
          <p className="text-muted-foreground p-3 text-sm">
            {model.pending.length > 0 ? 'Loading operations…' : 'This API has no operations.'}
          </p>
        )}
      </div>
      {selected && <OperationDetails row={selected} />}
    </div>
  )
}
