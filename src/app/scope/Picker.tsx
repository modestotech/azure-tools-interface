import { Label } from '@/components/ui/label'
import type { ResourceResult } from '@/services/result'

export interface PickerOption {
  readonly value: string
  readonly label: string
}

interface PickerProps<T> {
  readonly id: string
  readonly label: string
  /** Why the picker can't be used yet (the step before isn't done); undefined when it can. */
  readonly waitingFor: string | undefined
  readonly result: ResourceResult<readonly T[]> | undefined
  readonly toOption: (item: T) => PickerOption
  readonly value: string | undefined
  readonly onChange: (item: T | undefined) => void
}

/** One step of the scope picker: a select over a loaded list, with its own loading and error state. */
export function Picker<T>({
  id,
  label,
  waitingFor,
  result,
  toOption,
  value,
  onChange,
}: PickerProps<T>) {
  const items = result?.status === 'ok' ? result.data : []
  const options = items.map(toOption)
  const status = waitingFor
    ? waitingFor
    : result === undefined
      ? 'Loading…'
      : result.status === 'ok'
        ? items.length === 0
          ? 'None found.'
          : undefined
        : result.status === 'empty'
          ? 'None found.'
          : result.error.message
  const failed = result?.status === 'forbidden' || result?.status === 'error'

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50"
        disabled={options.length === 0}
        value={value ?? ''}
        onChange={(event) => {
          onChange(items[options.findIndex((option) => option.value === event.target.value)])
        }}
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {status && (
        <p className={failed ? 'text-destructive text-sm' : 'text-muted-foreground text-xs'}>
          {status}
        </p>
      )}
    </div>
  )
}
