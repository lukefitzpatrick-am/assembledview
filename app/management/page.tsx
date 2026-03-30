"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { DateRange } from "react-day-picker"

export default function ManagementPage() {
  const [date, setDate] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  })

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Management Overview</h1>
        <DateRangePicker
          value={date}
          onChange={(range) => setDate(range || { from: new Date(), to: new Date() })}
          className="w-[300px]"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Management Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Management dashboard content will be added here.</p>
        </CardContent>
      </Card>
    </div>
  )
}
