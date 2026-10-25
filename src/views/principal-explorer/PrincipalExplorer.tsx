import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  PRINCIPAL_KIND_LABEL,
  principalLabel,
  principalReach,
  reachedOperationIds,
  type PrincipalReach,
} from '../shared/reach'
import type { ViewProps } from '../types'
import { PrincipalDetails } from './PrincipalDetails'

function matches(entry: PrincipalReach, filter: string): boolean {
  const { principal } = entry
  const text = [
    principalLabel(principal),
    principal.id,
    PRINCIPAL_KIND_LABEL[principal.kind],
    'appId' in principal ? principal.appId : undefined,
    principal.kind === 'user' ? principal.userPrincipalName : undefined,
  ]
  const needle = filter.trim().toLowerCase()
  return text.some((value) => value?.toLowerCase().includes(needle))
}

/** A searchable list of every principal in the model, and what the selected one can reach. */
export default function PrincipalExplorer({ model }: ViewProps) {
  const entries = useMemo(() => principalReach(model), [model])
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const visible = useMemo(
    () => (filter ? entries.filter((entry) => matches(entry, filter)) : entries),
    [entries, filter],
  )
  const selected = entries.find((entry) => entry.principal.id === selectedId)

  const scrollRef = useRef<HTMLDivElement>(null)
  // The virtualizer's functions change identity on every render; React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  })

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(16rem,1fr)_2fr]">
      <div className="space-y-2">
        <Input
          aria-label="Filter principals"
          placeholder="Filter by name, ID or type…"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value)
          }}
        />
        <p className="text-muted-foreground text-sm">
          {visible.length} of {entries.length} principals
          {model.pending.length > 0 && ' · loading…'}
        </p>
        <div
          ref={scrollRef}
          className="max-h-[60vh] overflow-auto rounded-md border"
          role="listbox"
          aria-label="Principals"
        >
          <div className="relative" style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = visible[item.index]
              if (!entry) return null
              const { principal } = entry
              const isSelected = principal.id === selectedId
              const count = reachedOperationIds(entry).size
              return (
                <div
                  key={principal.id}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  className={cn(
                    'hover:bg-accent absolute inset-x-0 flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm',
                    isSelected && 'bg-accent',
                  )}
                  style={{ top: `${String(item.start)}px`, height: `${String(item.size)}px` }}
                  onClick={() => {
                    setSelectedId(principal.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setSelectedId(principal.id)
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{principalLabel(principal)}</span>
                    <span className="text-muted-foreground block text-xs">
                      {PRINCIPAL_KIND_LABEL[principal.kind]}
                    </span>
                  </span>
                  <Badge variant={count > 0 ? 'secondary' : 'outline'}>
                    {principal.kind === 'group' ? 'grants' : 'calls'} {count}
                  </Badge>
                </div>
              )
            })}
          </div>
          {entries.length === 0 && (
            <p className="text-muted-foreground p-3 text-sm">
              {model.pending.length > 0 ? 'Loading principals…' : 'No principal has access.'}
            </p>
          )}
        </div>
      </div>
      {selected ? (
        <PrincipalDetails model={model} entry={selected} />
      ) : (
        <p className="text-muted-foreground text-sm">
          Pick a principal to see the operations it can call.
        </p>
      )}
    </div>
  )
}
