"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isValidPickerDate, resolveDatePickerMonth } from "@/lib/date-picker-anchor"

export interface DatePickerProps {
  date?: Date
  setDate: (date?: Date) => void
}

const generalCtx = { kind: "general" as const }

export function DatePicker({ date, setDate }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => resolveDatePickerMonth(date, generalCtx))

  React.useEffect(() => {
    if (open) {
      setMonth(resolveDatePickerMonth(date, generalCtx))
    }
  }, [open, date])

  const selected = isValidPickerDate(date) ? date : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn("w-full justify-start text-left font-normal", !selected && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={(d) => {
            setDate(d)
            if (d) setOpen(false)
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
