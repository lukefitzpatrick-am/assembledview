"use client"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type DateRangePickerValue = DateRange | undefined

export interface DateRangePickerProps {
  value: DateRangePickerValue
  onChange: (next: DateRangePickerValue) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  numberOfMonths?: number
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick a date range",
  disabled,
  className,
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const label = value?.from
    ? value.to
      ? `${format(value.from, "dd.MM.yyyy")} - ${format(value.to, "dd.MM.yyyy")}`
      : format(value.from, "dd.MM.yyyy")
    : placeholder

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          initialFocus
          numberOfMonths={numberOfMonths}
        />
      </PopoverContent>
    </Popover>
  )
}

