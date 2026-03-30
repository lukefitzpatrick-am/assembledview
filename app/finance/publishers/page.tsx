"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Download } from "lucide-react"
import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { format, addMonths, startOfMonth } from "date-fns"
import { LoadingDots } from "@/components/ui/loading-dots"
import { formatMoney } from "@/lib/utils/money"
import type { PublisherInvoiceSection } from "@/lib/finance/publisherInvoiceReport"

const money = (n: number) =>
  formatMoney(n, {
    locale: "en-AU",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const thinBorder = {
  top: { style: "thin" as const },
  left: { style: "thin" as const },
  bottom: { style: "thin" as const },
  right: { style: "thin" as const },
} as ExcelJS.Borders

const headerFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2E7D32" },
}

const subtotalFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F5E9" },
}

const grandFill: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFC8E6C9" },
}

async function exportPublisherSectionToExcel(
  section: PublisherInvoiceSection,
  monthLabel: string,
  sectionName: string,
  fileStem: string
) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Publisher invoices", {
    views: [{ state: "frozen", ySplit: 5 }],
  })

  sheet.columns = [
    { width: 28 },
    { width: 26 },
    { width: 18 },
    { width: 36 },
    { width: 16 },
  ]

  sheet.mergeCells(1, 1, 1, 5)
  const title = sheet.getCell(1, 1)
  title.value = `Publisher media invoices — ${monthLabel}`
  title.font = { bold: true, size: 16, color: { argb: "FF1B5E20" } }
  title.alignment = { vertical: "middle" }

  sheet.mergeCells(2, 1, 2, 5)
  const sub = sheet.getCell(2, 1)
  sub.value =
    "Expected supplier media for the month (excludes line items marked client pays for media). Amounts match billing schedule media."
  sub.font = { size: 11, italic: true, color: { argb: "FF424242" } }
  sub.alignment = { wrapText: true, vertical: "middle" }

  sheet.getCell(3, 1).value = `Section: ${sectionName}`
  sheet.getCell(3, 1).font = { bold: true }

  const headerRow = 5
  const headers = ["Publisher", "Client", "MBA number", "Campaign", "Media"]
  headers.forEach((h, i) => {
    const c = sheet.getCell(headerRow, i + 1)
    c.value = h
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }
    c.fill = headerFill
    c.alignment = { vertical: "middle" }
    c.border = thinBorder
  })

  let r = headerRow + 1

  for (const pub of section.publishers) {
    for (const client of pub.clients) {
      for (const camp of client.campaigns) {
        const row = [pub.publisherName, client.clientName, camp.mbaNumber, camp.campaignName, camp.totalMedia]
        row.forEach((val, colIdx) => {
          const c = sheet.getCell(r, colIdx + 1)
          c.border = thinBorder
          if (colIdx === 4) {
            c.value = typeof val === "number" ? val : 0
            c.numFmt = "$#,##0.00"
            c.alignment = { horizontal: "right" }
          } else {
            c.value = val as string
            c.alignment = { vertical: "middle", wrapText: true }
          }
        })
        if (r % 2 === 0) {
          for (let c = 1; c <= 5; c++) {
            sheet.getCell(r, c).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF5F5F5" },
            }
          }
        }
        r++
      }
    }

    sheet.mergeCells(r, 1, r, 4)
    const stLabel = sheet.getCell(r, 1)
    stLabel.value = `Subtotal — ${pub.publisherName}`
    stLabel.font = { bold: true }
    stLabel.fill = subtotalFill
    stLabel.border = thinBorder

    const stAmt = sheet.getCell(r, 5)
    stAmt.value = pub.subtotal
    stAmt.numFmt = "$#,##0.00"
    stAmt.font = { bold: true }
    stAmt.fill = subtotalFill
    stAmt.alignment = { horizontal: "right" }
    stAmt.border = thinBorder
    r++
    r++
  }

  sheet.mergeCells(r, 1, r, 4)
  const gt = sheet.getCell(r, 1)
  gt.value = "Grand total — month"
  gt.font = { bold: true, size: 12 }
  gt.fill = grandFill
  gt.border = thinBorder

  const gta = sheet.getCell(r, 5)
  gta.value = section.grandTotal
  gta.numFmt = "$#,##0.00"
  gta.font = { bold: true, size: 12 }
  gta.fill = grandFill
  gta.alignment = { horizontal: "right" }
  gta.border = thinBorder

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const safeMonth = monthLabel.replace(/\s+/g, "_")
  saveAs(blob, `${fileStem}_${safeMonth}.xlsx`)
}

function PublisherSectionTable({
  section,
  emptyMessage,
}: {
  section: PublisherInvoiceSection
  emptyMessage: string
}) {
  if (section.publishers.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
  }

  return (
    <div className="space-y-8">
      {section.publishers.map((pub) => (
        <div key={pub.publisherName} className="rounded-lg border overflow-hidden">
          <div className="bg-emerald-900 text-emerald-50 px-4 py-2 font-semibold text-sm">
            {pub.publisherName}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/80 hover:bg-muted/80">
                <TableHead className="w-[22%]">Client</TableHead>
                <TableHead className="w-[14%]">MBA number</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right w-[11rem]">Media</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pub.clients.flatMap((client) =>
                client.campaigns.map((camp, idx) => (
                  <TableRow
                    key={`${pub.publisherName}-${client.clientName}-${camp.mbaNumber}-${camp.campaignName}-${idx}`}
                  >
                    <TableCell className="align-top font-medium">{client.clientName}</TableCell>
                    <TableCell className="align-top font-mono text-sm">{camp.mbaNumber}</TableCell>
                    <TableCell className="align-top">{camp.campaignName}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(camp.totalMedia)}</TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="bg-emerald-50 font-semibold border-t-2 border-emerald-200">
                <TableCell colSpan={3} className="text-right">
                  Subtotal — {pub.publisherName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(pub.subtotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ))}
      <div className="flex justify-end rounded-lg border-2 border-emerald-300 bg-emerald-100/80 px-4 py-3">
        <div className="text-right">
          <div className="text-sm font-medium text-emerald-900">Grand total — month</div>
          <div className="text-xl font-bold tabular-nums text-emerald-950">{money(section.grandTotal)}</div>
        </div>
      </div>
    </div>
  )
}

export default function FinancePublishersPage() {
  const currentDate = startOfMonth(new Date())

  const monthYearOptions = Array.from({ length: 25 }, (_, i) => {
    const date = addMonths(currentDate, i - 12)
    const monthYear = format(date, "MMMM yyyy")
    const value = format(date, "yyyy-MM")
    return {
      label: monthYear,
      value,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    }
  })

  const [selectedMonthYear, setSelectedMonthYear] = useState(
    monthYearOptions.find(
      (opt) => opt.year === currentDate.getFullYear() && opt.month === currentDate.getMonth() + 1
    )?.value || monthYearOptions[12].value
  )
  const [loading, setLoading] = useState(false)
  const [bookedApproved, setBookedApproved] = useState<PublisherInvoiceSection | null>(null)
  const [other, setOther] = useState<PublisherInvoiceSection | null>(null)
  const [metaNotice, setMetaNotice] = useState<string | undefined>()

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/finance/publishers?month=${selectedMonthYear}`)
      if (!response.ok) throw new Error("Failed to fetch publisher finance data")
      const data = await response.json()
      setBookedApproved(data.bookedApproved ?? { publishers: [], grandTotal: 0 })
      setOther(data.other ?? { publishers: [], grandTotal: 0 })
      setMetaNotice(data.meta?.notice)
    } catch (e) {
      console.error(e)
      alert("Failed to load data. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const monthLabel =
    monthYearOptions.find((o) => o.value === selectedMonthYear)?.label ?? selectedMonthYear

  const hasData =
    (bookedApproved && (bookedApproved.grandTotal > 0 || bookedApproved.publishers.length > 0)) ||
    (other && (other.grandTotal > 0 || other.publishers.length > 0))

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Finance — Publishers</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Media amounts you should expect to receive supplier invoices for, by publisher (from the billing
            schedule). Rows where the line item is marked <span className="font-medium">client pays for media</span>{" "}
            are excluded. Re-save plans from the MBA editor to persist that flag on older billing JSON.
          </p>
        </div>
        <div className="flex gap-3 items-center shrink-0">
          <Combobox
            value={selectedMonthYear}
            onValueChange={setSelectedMonthYear}
            placeholder="Select month/year"
            searchPlaceholder="Search months..."
            buttonClassName="w-[200px]"
            options={monthYearOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <Button onClick={loadData} disabled={loading}>
            {loading ? (
              <>
                <LoadingDots size="sm" className="mr-2" />
                Loading...
              </>
            ) : (
              "Load"
            )}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-2 border-muted" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
          </div>
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      )}

      {!loading && metaNotice && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-950">{metaNotice}</CardContent>
        </Card>
      )}

      {!loading && hasData && (
        <>
          {bookedApproved && bookedApproved.publishers.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <CardTitle>Booked / approved</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      exportPublisherSectionToExcel(
                        bookedApproved,
                        monthLabel,
                        "Booked / approved",
                        "Finance_Publishers_BookedApproved"
                      )
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <PublisherSectionTable
                  section={bookedApproved}
                  emptyMessage="No rows in this section."
                />
              </CardContent>
            </Card>
          )}

          {other && other.publishers.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <CardTitle>Other campaigns</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() =>
                      exportPublisherSectionToExcel(
                        other,
                        monthLabel,
                        "Other campaigns",
                        "Finance_Publishers_Other"
                      )
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <PublisherSectionTable section={other} emptyMessage="No rows in this section." />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && !hasData && (
        <Card className="border-border/40 shadow-sm">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No publisher invoice data for this month yet. Choose a month and click Load.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
