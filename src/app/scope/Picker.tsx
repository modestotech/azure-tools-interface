import { Combobox, type ComboboxOption } from '@/components/Combobox'
import { Label } from '@/components/ui/label'
import type { ResourceResult } from '@/services/result'

interface PickerProps<T> {
  readonly id: string
  readonly label: string
  /** Why the picker can't be used yet (the step before isn't done); undefined when it can. */
  readonly waitingFor: string | undefined
  readonly result: ResourceResult<readonly T[]> | undefined
  readonly toOption: (item: T) => ComboboxOption
  readonly value: string | undefined
  readonly onChange: (item: T | undefined) => void
}

/** What to show under the picker: why it's waiting, loading, an error, or nothing to pick. */
function statusText(
  waitingFor: string | undefined,
  result: ResourceResult<readonly unknown[]> | undefined,
) {
  if (waitingFor) return waitingFor
  if (result === undefined) return 'Loading…'
  if (result.status === 'forbidden' || result.status === 'error') return result.error.message
  if (result.status === 'empty' || result.data.length === 0) return 'None found.'
  return undefined
}

/** One step of the scope picker: a searchable list with its own loading and error state. */
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
  const status = statusText(waitingFor, result)
  const failed = result?.status === 'forbidden' || result?.status === 'error'
  const labelId = `${id}-label`

  return (
    <div className="min-w-0 space-y-1">
      <Label id={labelId} htmlFor={id}>
        {label}
      </Label>
      <Combobox
        id={id}
        labelledBy={labelId}
        options={options}
        value={value}
        disabled={options.length === 0}
        onChange={(picked) => {
          onChange(items[options.findIndex((option) => option.value === picked)])
        }}
      />
      {status && (
        <p className={failed ? 'text-destructive text-sm' : 'text-muted-foreground text-xs'}>
          {status}
        </p>
      )}
    </div>
  )
}
