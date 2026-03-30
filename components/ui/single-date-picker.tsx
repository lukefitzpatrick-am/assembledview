"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  isValidPickerDate,
  resolveDatePickerMonth,
  type DatePickerMonthContext,
} from "@/lib/date-picker-anchor"

export interface SingleDatePickerProps
  extends Omit<React.ComponentProps<typeof Button>, "value" | "onSelect" | "onChange"> {
  value?: Date | null
  onChange: (date?: Date) => void
  calendarContext?: "general" | "media-burst"
  mediaBurstRole?: "start" | "end"
  campaignStartDate?: Date | null
  campaignEndDate?: Date | null
  isDateDisabled?: (date: Date) => boolean
  dateFormat?: string
  placeholder?: React.ReactNode
  align?: "start" | "end" | "center"
  iconClassName?: string
  closeOnSelect?: boolean
}

export const SingleDatePicker = React.forwardRef<HTMLButtonElement, SingleDatePickerProps>(
  function SingleDatePicker(
    {
      value,
      onChange,
      calendarContext = "general",
      mediaBurstRole = "start",
      campaignStartDate,
      campaignEndDate,
      isDateDisabled,
      dateFormat = "dd/MM/yy",
      placeholder = <span>Pick date</span>,
      align = "start",
      iconClassName = "ml-auto h-3 w-3 opacity-50",
      closeOnSelect = true,
      className,
      type: _type,
      ...buttonProps
    },
    ref
  ) {
    const [open, setOpen] = React.useState(false)

    const monthContext = React.useMemo<DatePickerMonthContext>(() => {
      if (calendarContext === "general") {
        return { kind: "general" }
      }
      return {
        kind: "media-burst",
        role: mediaBurstRole,
        campaignStart: campaignStartDate,
        campaignEnd: campaignEndDate,
      }
    }, [calendarContext, mediaBurstRole, campaignStartDate, campaignEndDate])

    const [month, setMonth] = React.useState(() => resolveDatePickerMonth(value, monthContext))

    React.useEffect(() => {
      if (open) {
        setMonth(resolveDatePickerMonth(value, monthContext))
      }
    }, [open, value, monthContext])

    const selected = isValidPickerDate(value) ? value : undefined

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !selected && "text-muted-foreground",
              className
            )}
            {...buttonProps}
          >
            {selected ? format(selected, dateFormat) : placeholder}
            <CalendarIcon className={iconClassName} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(d) => {
              onChange(d)
              if (closeOnSelect && d) {
                setOpen(false)
              }
            }}
            disabled={isDateDisabled}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    )
  }
)

SingleDatePicker.displayName = "SingleDatePicker"
