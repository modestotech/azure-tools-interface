import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { matchesSearch } from './searchMatch'

export interface ComboboxOption {
  readonly value: string
  readonly label: string
}

interface ComboboxProps {
  readonly id: string
  /** ID of the element that labels the combobox. */
  readonly labelledBy: string
  readonly options: readonly ComboboxOption[]
  readonly value: string | undefined
  readonly onChange: (value: string) => void
  readonly disabled?: boolean
  readonly placeholder?: string
}

/**
 * A searchable dropdown (shadcn's Combobox pattern: Popover + Command). Not Radix Select: while
 * open, Select locks scrolling by injecting a <style> tag, which the CSP blocks. A non-modal
 * Popover injects nothing.
 */
export function Combobox({
  id,
  labelledBy,
  options,
  value,
  onChange,
  disabled = false,
  placeholder = 'Choose…',
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-labelledby={labelledBy}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        {/* Contains-or-wildcard matching, not cmdk's fuzzy default (see searchMatch.ts). */}
        <Command
          filter={(value, search, keywords) =>
            matchesSearch([value, ...(keywords ?? [])].join(' '), search) ? 1 : 0
          }
        >
          {options.length > 7 && <CommandInput placeholder="Search… (* matches anything)" />}
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn(option.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
