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
import { writeSowFinanceWorksheet, workbookToXlsxBuffer } from "@/lib/finance/excelFinanceExport"

interface FinanceLineItem {
  itemCode: string
  mediaType: string
  description: string
  amount: number
}

interface FinanceServiceRow {
  itemCode: string
  service: string
  amount: number
}

interface FinanceCampaignData {
  clientName: string
  mbaNumber: string
  poNumber?: string
  campaignName: string
  paymentDays: number
  paymentTerms: string
  invoiceDate: string
  lineItems: FinanceLineItem[]
  serviceRows: FinanceServiceRow[]
  total: number
}

export default function FinanceSOWPage() {
  const currentDate = startOfMonth(new Date())

  const monthYearOptions = Array.from({ length: 25 }, (_, i) => {
    const date = addMonths(currentDate, i - 12)
    const monthYear = format(date, "MMMM yyyy")
    const value = format(date, "yyyy-MM")
    return {
      label: monthYear,
      value: value,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    }
  })

  const [selectedMonthYear, setSelectedMonthYear] = useState(
    monthYearOptions.find((opt) => opt.year === currentDate.getFullYear() && opt.month === currentDate.getMonth() + 1)?.value || monthYearOptions[12].value
  )
  const [loading, setLoading] = useState(false)
  const [bookedApproved, setBookedApproved] = useState<FinanceCampaignData[]>([])
  const [other, setOther] = useState<FinanceCampaignData[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/finance/sow?month=${selectedMonthYear}`)
      if (!response.ok) {
        throw new Error("Failed to fetch SOW finance data")
      }
      const data = await response.json()
      setBookedApproved(data.bookedApproved || [])
      setOther(data.other || [])
    } catch (error) {
      console.error("Error loading SOW finance data:", error)
      alert("Failed to load SOW finance data. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const exportToExcel = async (campaigns: FinanceCampaignData[], sectionName: string) => {
    const workbook = new ExcelJS.Workbook()
    await writeSowFinanceWorksheet(workbook, "Finance SOW Report", campaigns)
    const buffer = await workbookToXlsxBuffer(workbook)
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const selectedOption = monthYearOptions.find((opt) => opt.value === selectedMonthYear)
    const monthYearLabel = selectedOption?.label.replace(" ", "_") || "Month_Year"
    saveAs(blob, `Finance_SOW_${sectionName}_${monthYearLabel}.xlsx`)
  }

  const renderTable = (campaign: FinanceCampaignData) => {
    const totalAmount = campaign.total

    return (
      <div key={campaign.mbaNumber} className="mb-8">
        <div className="mb-4 overflow-hidden rounded-lg border border-border/40 bg-muted/10">
          <div className="border-b border-border/30 bg-muted/30 px-4 py-2.5">
            <span className="text-sm font-semibold">{campaign.clientName}</span>
            <span className="ml-2 text-xs text-muted-foreground">· {campaign.mbaNumber}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-3">
            {[
              { label: "Scope", value: campaign.campaignName },
              { label: "PO Number", value: campaign.poNumber || "N/A" },
              { label: "Payment", value: `${campaign.paymentDays} - ${campaign.paymentTerms}` },
              {
                label: "Invoice Date",
                value: format(new Date(campaign.invoiceDate), "dd/MM/yyyy"),
              },
            ].map((item) => (
              <div key={item.label}>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </span>
                <p className="mt-0.5 text-sm">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaign.lineItems.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.itemCode}</TableCell>
                <TableCell>{item.mediaType}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right">
                  {formatMoney(item.amount, {
                    locale: "en-AU",
                    currency: "AUD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
              </TableRow>
            ))}
            {campaign.serviceRows.map((service, index) => (
              <TableRow key={`service-${index}`}>
                <TableCell>{service.itemCode}</TableCell>
                <TableCell>{service.service}</TableCell>
                <TableCell></TableCell>
                <TableCell className="text-right">
                  {formatMoney(service.amount, {
                    locale: "en-AU",
                    currency: "AUD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 border-primary/20 bg-muted/30 font-semibold">
              <TableCell colSpan={3} className="text-right">
                Total
              </TableCell>
              <TableCell className="text-right">
                {formatMoney(totalAmount, {
                  locale: "en-AU",
                  currency: "AUD",
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="w-full max-w-none px-4 pb-12 pt-0 md:px-6">
      <div className="relative -mx-4 mb-6 border-b border-border/40 bg-gradient-to-br from-primary/5 via-background to-background px-4 pb-6 pt-8 md:-mx-6 md:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Finance — Scopes of Work</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monthly scope of work billing by campaign.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
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
            <Button onClick={loadData} disabled={loading} className="shadow-sm">
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

      {!loading && (bookedApproved.length > 0 || other.length > 0) && (
        <>
          {bookedApproved.length > 0 && (
            <Card className="mb-6 overflow-hidden border-border/40 shadow-sm">
              <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Approved / In progress</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToExcel(bookedApproved, "BookedApproved")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bookedApproved.map((campaign) => renderTable(campaign))}
              </CardContent>
            </Card>
          )}

          {other.length > 0 && (
            <Card className="overflow-hidden border-border/40 shadow-sm">
              <div className="h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Other scopes</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToExcel(other, "Other")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {other.map((campaign) => renderTable(campaign))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!loading && bookedApproved.length === 0 && other.length === 0 && (
        <Card className="border-border/40 shadow-sm">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No data available for the selected month. Click &quot;Load&quot; to fetch data.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


























