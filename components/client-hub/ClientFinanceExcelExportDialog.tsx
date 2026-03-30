"use client"

import { useState } from "react"
import ExcelJS from "exceljs"
import { saveAs } from "file-saver"
import { addMonths, format, startOfMonth } from "date-fns"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Combobox } from "@/components/ui/combobox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LoadingDots } from "@/components/ui/loading-dots"
import type { FinanceCampaignData } from "@/lib/finance/utils"
import { formatInvoiceDate } from "@/lib/finance/utils"
import {
  type FinanceExcelClientMeta,
  writeMediaFinanceWorksheet,
  writeRetainerFinanceWorksheet,
  writeSowFinanceWorksheet,
  workbookToXlsxBuffer,
} from "@/lib/finance/excelFinanceExport"

function readNumberField(record: Record<string, unknown> | null, key: string): number {
  if (!record) return 0
  const v = record[key]
  if (typeof v === "number" && !Number.isNaN(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function readTextField(record: Record<string, unknown> | null, key: string, fallback: string): string {
  if (!record) return fallback
  const v = record[key]
  if (typeof v === "string" && v.trim()) return v.trim()
  return fallback
}

/** ABN may be stored as string or number in Xano */
function readAbnField(record: Record<string, unknown> | null): string {
  if (!record) return ""
  const v = record.abn
  if (v == null) return ""
  if (typeof v === "string") return v.trim()
  return String(v).trim()
}

function buildClientExcelMeta(record: Record<string, unknown> | null): FinanceExcelClientMeta {
  return {
    legalBusinessName: readTextField(record, "legalbusinessname", ""),
    abn: readAbnField(record),
  }
}

function safeFileStem(name: string): string {
  const s = name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  return s.slice(0, 80) || "Client"
}

export function buildMonthYearOptions() {
  const currentDate = startOfMonth(new Date())
  return Array.from({ length: 25 }, (_, i) => {
    const date = addMonths(currentDate, i - 12)
    return {
      label: format(date, "MMMM yyyy"),
      value: format(date, "yyyy-MM"),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    }
  })
}

export function ClientFinanceExcelExportDialog({
  open,
  onOpenChange,
  clientName,
  clientRecord,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName: string
  clientRecord: Record<string, unknown> | null
}) {
  const monthYearOptions = buildMonthYearOptions()
  const currentDate = startOfMonth(new Date())

  const [selectedMonthYear, setSelectedMonthYear] = useState(
    () =>
      monthYearOptions.find(
        (opt) => opt.year === currentDate.getFullYear() && opt.month === currentDate.getMonth() + 1
      )?.value ?? monthYearOptions[12].value
  )
  const [includeMedia, setIncludeMedia] = useState(true)
  const [includeRetainer, setIncludeRetainer] = useState(true)
  const [includeSow, setIncludeSow] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const encodedClient = encodeURIComponent(clientName)
  const monthlyRetainer = readNumberField(clientRecord, "monthlyretainer")
  const paymentDays = readNumberField(clientRecord, "payment_days") || 30
  const paymentTerms = readTextField(clientRecord, "payment_terms", "Net 30 days")
  const mbaIdentifier = readTextField(clientRecord, "mbaidentifier", "N/A")
  const clientExcelMeta = buildClientExcelMeta(clientRecord)

  const onDownload = async () => {
    if (!includeMedia && !includeRetainer && !includeSow) {
      window.alert("Select at least one export type (media, retainer, or scopes of work).")
      return
    }

    setDownloading(true)
    const warnings: string[] = []

    try {
      const workbook = new ExcelJS.Workbook()
      const [y, m] = selectedMonthYear.split("-").map(Number)

      let mediaCombined: FinanceCampaignData[] | null = null
      let sowCombined: FinanceCampaignData[] | null = null
      let retainerOk = false

      if (includeMedia) {
        const res = await fetch(`/api/finance/data?month=${selectedMonthYear}&client=${encodedClient}`)
        if (!res.ok) {
          throw new Error("Failed to load media finance data")
        }
        const data = await res.json()
        const booked = (data.bookedApproved || []) as FinanceCampaignData[]
        const other = (data.other || []) as FinanceCampaignData[]
        mediaCombined = [...booked, ...other]
        if (mediaCombined.length === 0) {
          warnings.push("Media: no invoice rows for this client and month.")
          mediaCombined = null
        }
      }

      if (includeSow) {
        const res = await fetch(`/api/finance/sow?month=${selectedMonthYear}&client=${encodedClient}`)
        if (!res.ok) {
          throw new Error("Failed to load scopes of work finance data")
        }
        const data = await res.json()
        const booked = (data.bookedApproved || []) as FinanceCampaignData[]
        const other = (data.other || []) as FinanceCampaignData[]
        sowCombined = [...booked, ...other]
        if (sowCombined.length === 0) {
          warnings.push("Scopes of work: no rows for this client and month.")
          sowCombined = null
        }
      }

      if (includeRetainer) {
        if (monthlyRetainer <= 0) {
          warnings.push("Retainer: no monthly retainer amount on file for this client.")
        } else {
          retainerOk = true
        }
      }

      const sheetCount = (mediaCombined ? 1 : 0) + (sowCombined ? 1 : 0) + (retainerOk ? 1 : 0)
      const multiSection = sheetCount > 1

      if (mediaCombined) {
        const sheetName = multiSection ? "Media" : "Finance Report"
        await writeMediaFinanceWorksheet(workbook, sheetName, mediaCombined, clientExcelMeta)
      }

      if (sowCombined) {
        const sheetName = multiSection ? "Scopes of Work" : "Finance SOW Report"
        await writeSowFinanceWorksheet(workbook, sheetName, sowCombined, clientExcelMeta)
      }

      if (retainerOk) {
        await writeRetainerFinanceWorksheet(workbook, "Retainer", {
          clientName,
          mbaIdentifier,
          paymentDays,
          paymentTerms,
          invoiceDateIso: formatInvoiceDate(y, m),
          monthlyRetainer,
          legalBusinessName: clientExcelMeta.legalBusinessName,
          abn: clientExcelMeta.abn,
        })
      }

      if (workbook.worksheets.length === 0) {
        window.alert(
          warnings.length > 0
            ? warnings.join("\n")
            : "Nothing to export for the selected month and options."
        )
        return
      }

      const buffer = await workbookToXlsxBuffer(workbook)
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const monthLabel =
        monthYearOptions.find((o) => o.value === selectedMonthYear)?.label.replace(/\s+/g, "_") ?? "Month"
      const stem = safeFileStem(clientName)
      saveAs(blob, `Finance_${stem}_${monthLabel}.xlsx`)

      if (warnings.length > 0) {
        window.alert(`Downloaded workbook. Note:\n${warnings.join("\n")}`)
      }
      onOpenChange(false)
    } catch (e) {
      console.error(e)
      window.alert(e instanceof Error ? e.message : "Export failed.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export finance workbook</DialogTitle>
          <DialogDescription>
            Same Excel layouts as Finance → Media and Finance → Scopes of Work. Retainer uses the monthly amount from
            the client record. Choose the billing month and sections to include.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Month</Label>
            <Combobox
              value={selectedMonthYear}
              onValueChange={setSelectedMonthYear}
              placeholder="Select month"
              searchPlaceholder="Search months..."
              buttonClassName="w-full"
              options={monthYearOptions.map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>

          <div className="space-y-3">
            <Label>Include</Label>
            <div className="flex items-center gap-3">
              <Checkbox
                id="fin-exp-media"
                checked={includeMedia}
                onCheckedChange={(v) => setIncludeMedia(v === true)}
              />
              <label htmlFor="fin-exp-media" className="text-sm leading-none">
                Media (media plans / billing schedule)
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="fin-exp-sow" checked={includeSow} onCheckedChange={(v) => setIncludeSow(v === true)} />
              <label htmlFor="fin-exp-sow" className="text-sm leading-none">
                Scopes of work
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="fin-exp-retainer"
                checked={includeRetainer}
                onCheckedChange={(v) => setIncludeRetainer(v === true)}
              />
              <label htmlFor="fin-exp-retainer" className="text-sm leading-none">
                Retainer
                {monthlyRetainer <= 0 ? (
                  <span className="ml-1 text-xs text-muted-foreground">(no amount on file)</span>
                ) : null}
              </label>
            </div>
          </div>

          <Button type="button" className="w-full" disabled={downloading} onClick={onDownload}>
            {downloading ? (
              <>
                <LoadingDots size="sm" className="mr-2" />
                Building…
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
