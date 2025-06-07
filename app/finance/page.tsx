"use client"

import { useState } from "react"
import { Calendar } from "@/components/ui/calendar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { DateRange } from "react-day-picker"

// Mock data for demonstration
const financeData = [
  {
    client: "Client A",
    mediaType: "Digital",
    fees: 1500,
    total: 1500
  },
  {
    client: "Client A",
    mediaType: "Print",
    fees: 2000,
    total: 2000
  },
  {
    client: "Client B",
    mediaType: "Digital",
    fees: 3000,
    total: 3000
  }
]

export default function FinancePage() {
  const [date, setDate] = useState<DateRange>({
    from: new Date(),
    to: new Date()
  })

  // Calculate subtotals and grand total
  const clientTotals = financeData.reduce((acc, item) => {
    if (!acc[item.client]) {
      acc[item.client] = 0
    }
    acc[item.client] += item.total
    return acc
  }, {} as Record<string, number>)

  const grandTotal = Object.values(clientTotals).reduce((sum, total) => sum + total, 0)

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Finance Overview</h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[300px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "dd.MM.yyyy")} - {format(date.to, "dd.MM.yyyy")}
                  </>
                ) : (
                  format(date.from, "dd.MM.yyyy")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={date}
              onSelect={(range) => setDate(range || { from: new Date(), to: new Date() })}
              initialFocus
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Financial Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Media Type</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {financeData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{item.client}</TableCell>
                  <TableCell>{item.mediaType}</TableCell>
                  <TableCell className="text-right">${item.fees.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${item.total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {/* Client subtotals */}
              {Object.entries(clientTotals).map(([client, total]) => (
                <TableRow key={client} className="font-semibold">
                  <TableCell colSpan={3} className="text-right">Subtotal for {client}</TableCell>
                  <TableCell className="text-right">${total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {/* Grand total */}
              <TableRow className="font-bold">
                <TableCell colSpan={3} className="text-right">Grand Total</TableCell>
                <TableCell className="text-right">${grandTotal.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
} 