"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { sortByLabel } from "@/lib/utils/sort"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const sortedOptions = React.useMemo(
    () => sortByLabel(options, (o) => o.label),
    [options]
  )

  const selected = React.useMemo(
    () => sortedOptions.find((o) => o.value === value),
    [sortedOptions, value]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", buttonClassName)}
          disabled={disabled}
        >
          <span className={cn("truncate", !selected ? "text-muted-foreground" : undefined, className)}>
            {selected ? selected.label : placeholder}
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
                      setOpen(false)
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

