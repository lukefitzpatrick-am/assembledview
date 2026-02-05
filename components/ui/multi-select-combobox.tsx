"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type MultiSelectOption = {
  value: string
  label: string
  keywords?: string
  disabled?: boolean
}

export interface MultiSelectComboboxProps {
  options: readonly MultiSelectOption[]
  values: readonly string[]
  onValuesChange: (values: string[]) => void
  placeholder?: string
  allSelectedText?: string
  selectAllText?: string
  clearAllText?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  buttonClassName?: string
  contentClassName?: string
  align?: "start" | "center" | "end"
}

export function MultiSelectCombobox({
  options,
  values,
  onValuesChange,
  placeholder = "Select options",
  allSelectedText = "All months",
  selectAllText = "Select all",
  clearAllText = "Unselect all",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  className,
  buttonClassName,
  contentClassName,
  align = "start",
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false)

  const valuesSet = React.useMemo(() => new Set(values), [values])
  const selectableOptions = React.useMemo(() => options.filter((o) => !o.disabled), [options])
  const allSelectableValues = React.useMemo(() => selectableOptions.map((o) => o.value), [selectableOptions])
  const isAllSelected = React.useMemo(() => {
    if (!allSelectableValues.length) return false
    return allSelectableValues.every((value) => valuesSet.has(value))
  }, [allSelectableValues, valuesSet])

  const selectedLabels = React.useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]))
    return values.map((v) => map.get(v)).filter(Boolean) as string[]
  }, [options, values])

  const buttonText = React.useMemo(() => {
    if (!values.length) return placeholder
    if (isAllSelected) return allSelectedText
    if (selectedLabels.length <= 2) return selectedLabels.join(", ")
    return `${values.length} selected`
  }, [allSelectedText, isAllSelected, placeholder, selectedLabels, values.length])

  const toggle = React.useCallback(
    (value: string) => {
      if (valuesSet.has(value)) {
        onValuesChange(values.filter((v) => v !== value))
      } else {
        onValuesChange([...values, value])
      }
    },
    [onValuesChange, values, valuesSet]
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
          <span className={cn("truncate", !values.length ? "text-muted-foreground" : undefined, className)}>
            {buttonText}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[--radix-popover-trigger-width] p-0", contentClassName)} align={align}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || selectableOptions.length === 0 || isAllSelected}
              onClick={() => onValuesChange(allSelectableValues)}
            >
              {selectAllText}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || values.length === 0}
              onClick={() => onValuesChange([])}
            >
              {clearAllText}
            </Button>
          </div>
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = valuesSet.has(option.value)
                const searchValue = `${option.label} ${option.keywords ?? ""}`.trim()

                return (
                  <CommandItem
                    key={option.value}
                    value={searchValue}
                    disabled={option.disabled}
                    onSelect={() => toggle(option.value)}
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

