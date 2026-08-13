"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { AssignTargetOption } from "@/lib/fireflies/assignTargets"
import { cn } from "@/lib/utils"

const GROUP_ORDER: AssignTargetOption["group"][] = [
  "Clients",
  "Publishers",
  "Other",
]

export function FirefliesAssignTargetCombobox({
  id,
  options,
  value,
  onValueChange,
  disabled,
}: {
  id: string
  options: AssignTargetOption[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  )
  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: options.filter((o) => o.group === group),
    })).filter((g) => g.items.length > 0)
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-8 w-full min-w-[16rem] justify-between"
        >
          <span
            className={cn(
              "truncate",
              !selected ? "text-muted-foreground" : undefined
            )}
          >
            {selected ? selected.label : "Assign to…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search clients and publishers…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {grouped.map(({ group, items }) => (
              <CommandGroup key={group} heading={group}>
                {items.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => {
                      onValueChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        option.value === value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
