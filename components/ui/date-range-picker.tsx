"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { resolveRangePickerMonth } from "@/lib/date-picker-anchor"

export type DateRangePickerValue = DateRange | undefined

export interface DateRangePickerProps {
  value: DateRangePickerValue
  onChange: (next: DateRangePickerValue) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  numberOfMonths?: number
  /** date-fns format string for the trigger label (default dd.MM.yyyy) */
  displayFormat?: string
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick a date range",
  disabled,
  className,
  numberOfMonths = 2,
  displayFormat = "dd.MM.yyyy",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => resolveRangePickerMonth(value))

  React.useEffect(() => {
    if (open) {
      setMonth(resolveRangePickerMonth(value))
    }
  }, [open, value])

  const label = value?.from
    ? value.to
      ? `${format(value.from, displayFormat)} - ${format(value.to, displayFormat)}`
      : format(value.from, displayFormat)
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          month={month}
          onMonthChange={setMonth}
          selected={value}
          onSelect={onChange}
          initialFocus
          numberOfMonths={numberOfMonths}
        />
      </PopoverContent>
    </Popover>
  )
}
