"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { sortByLabel } from "@/lib/utils/sort"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const ComboboxModalContext = React.createContext(false)

/**
 * Opt-in modal behaviour for Comboboxes rendered inside a modal Dialog.
 * Wrap expert-grid dialog content in this provider so the Combobox popover
 * owns its own focus scope and pointer-events instead of being trapped by the
 * parent Dialog. Standard, non-dialog Comboboxes stay non-modal (the default).
 */
export function ComboboxModalProvider({ children }: { children: React.ReactNode }) {
  return <ComboboxModalContext.Provider value={true}>{children}</ComboboxModalContext.Provider>
}

export type ComboboxOption = {
  value: string
  label: string
  keywords?: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: readonly ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  buttonClassName?: string
  contentClassName?: string
  align?: "start" | "center" | "end"
  /** For spreadsheet-style grid focus (e.g. expert mode). */
  id?: string
  onOpenChange?: (open: boolean) => void
  /** Fires when the trigger button receives focus (e.g. Tab); use with expert grids for paste anchoring. */
  onTriggerFocus?: () => void
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  className,
  buttonClassName,
  contentClassName,
  align = "start",
  id,
  onOpenChange,
  onTriggerFocus,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const modal = React.useContext(ComboboxModalContext)

  const setOpenBoth = React.useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange]
  )

  const sortedOptions = React.useMemo(() => {
    const seen = new Set<ComboboxOption["value"]>()
    const uniqueOptions: ComboboxOption[] = []

    for (const option of options) {
      if (seen.has(option.value)) continue
      seen.add(option.value)
      uniqueOptions.push(option)
    }

    return sortByLabel(uniqueOptions, (o) => o.label)
  }, [options])

  const selected = React.useMemo(
    () => sortedOptions.find((o) => o.value === value),
    [sortedOptions, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpenBoth} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", buttonClassName)}
          disabled={disabled}
          onFocus={() => onTriggerFocus?.()}
        >
          <span
            className={cn(
              "truncate",
              !selected && !value ? "text-muted-foreground" : undefined,
              className
            )}
          >
            {selected ? selected.label : value ? value : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[--radix-popover-trigger-width] p-0", contentClassName)}
        align={align}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {sortedOptions.map((option) => {
                const isSelected = option.value === value
                const searchValue = `${option.label} ${option.keywords ?? ""}`.trim()

                return (
                  <CommandItem
                    key={option.value}
                    value={searchValue}
                    disabled={option.disabled}
                    onSelect={() => {
                      onValueChange(option.value)
                      setOpenBoth(false)
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

