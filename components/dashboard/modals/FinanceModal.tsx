"use client"

import { useState } from "react"
import { AlertTriangle, ArrowUpRight, FileDown, FileSpreadsheet, ReceiptText } from "lucide-react"

import { ClientFinanceExcelExportDialog } from "@/components/client-hub/ClientFinanceExcelExportDialog"
import { UpcomingBillingSection } from "@/components/client-hub/UpcomingBillingSection"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type QuarterStatus = "complete" | "in-progress" | "planned"
type TransactionType = "expense" | "credit" | "adjustment"

export interface FinanceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  finance: {
    totalBudget: number
    ytdSpend: number
    currency: string
    budgetByQuarter: Array<{
      quarter: string
      budget: number
      spent: number
      status: QuarterStatus
    }>
    spendByMediaType: Array<{
      mediaType: string
      amount: number
      percentage: number
    }>
    recentTransactions?: Array<{
      id: string
      description: string
      date: string
      amount: number
      type: TransactionType
    }>
    outstandingInvoices?: {
      count: number
      totalAmount: number
      nextInvoiceDate?: string
      paymentStatus?: "on-track" | "overdue" | "due-soon"
    }
  }
  onDownloadReport?: () => void
  onExportCsv?: () => void
  onViewFullBreakdown?: () => void
  onViewAllTransactions?: () => void
  /** Client hub (`/client/[slug]`): extra billing preview + Excel export dialog. */
  variant?: "default" | "clientHub"
  clientName?: string
  clientRecord?: Record<string, unknown> | null
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
}

function formatLocaleForCurrency(currency: string): string {
  return currency === "AUD" ? "en-AU" : "en-US"
}

function compactCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(formatLocaleForCurrency(currency), {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function fullCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(formatLocaleForCurrency(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed)
}

function quarterProgressClass(status: QuarterStatus, isOverBudget: boolean): string {
  if (isOverBudget) return "bg-rose-500"
  if (status === "complete") return "bg-emerald-500"
  if (status === "in-progress") return "bg-blue-500"
  return "bg-slate-400"
}

function quarterStatusText(
  status: QuarterStatus,
  spent: number,
  budget: number,
  currency: string,
  isOverBudget: boolean
): string {
  if (isOverBudget) return `${compactCurrency(spent - budget, currency)} over budget`
  if (status === "complete") return "Complete"
  if (status === "planned") return "Planned"

  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0
  return `${compactCurrency(spent, currency)} spent (${pct}%)`
}

export function FinanceModal({
  open,
  onOpenChange,
  finance,
  onDownloadReport,
  onExportCsv,
  onViewFullBreakdown,
  onViewAllTransactions,
  variant = "default",
  clientName = "",
  clientRecord = null,
}: FinanceModalProps) {
  const [excelDialogOpen, setExcelDialogOpen] = useState(false)
  const isClientHub = variant === "clientHub"
  const ytdPct = finance.totalBudget > 0 ? Math.round((finance.ytdSpend / finance.totalBudget) * 100) : 0
  const mediaTop = finance.spendByMediaType.slice(0, 5)
  const txTop = (finance.recentTransactions ?? []).slice(0, 10)
  const maxMediaAmount = mediaTop.reduce((max, item) => Math.max(max, item.amount), 0)

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/70 px-6 py-5 text-left">
          <SheetTitle>Finance</SheetTitle>
          <SheetDescription>
            {isClientHub
              ? "Budget status, upcoming billing, and finance exports for this client."
              : "Budget status, allocation, and recent client financial activity."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-152px)]">
          <div className="space-y-6 px-6 py-6">
            <section className="grid grid-cols-2 gap-3">
              <article className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Budget</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {compactCurrency(finance.totalBudget, finance.currency)}
                </p>
              </article>
              <article className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">YTD Spend</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {compactCurrency(finance.ytdSpend, finance.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{ytdPct}% of total budget</p>
              </article>
            </section>

            <Separator />

            <section>
              <SectionHeader title="Budget Allocation" />
              {finance.budgetByQuarter.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                  Quarterly breakdown coming soon
                </p>
              ) : (
                <div className="space-y-3">
                  {finance.budgetByQuarter.map((quarter) => {
                    const pct = quarter.budget > 0 ? Math.min(100, Math.max(0, (quarter.spent / quarter.budget) * 100)) : 0
                    const isOverBudget = quarter.spent > quarter.budget && quarter.status !== "planned"

                    return (
                      <article key={quarter.quarter} className="rounded-lg bg-muted/50 p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{quarter.quarter}</p>
                          <p className="text-sm text-muted-foreground">{compactCurrency(quarter.budget, finance.currency)}</p>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", quarterProgressClass(quarter.status, isOverBudget))}
                            style={{ width: `${pct}%` }}
                            aria-hidden
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className={cn("text-xs", isOverBudget ? "text-rose-600" : "text-muted-foreground")}>
                            {quarterStatusText(quarter.status, quarter.spent, quarter.budget, finance.currency, isOverBudget)}
                          </p>
                          {isOverBudget ? <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden /> : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <Separator />

            <section>
              <SectionHeader title="Spend by Media Type" />
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="space-y-3">
                  {mediaTop.map((item) => {
                    const widthPct = maxMediaAmount > 0 ? (item.amount / maxMediaAmount) * 100 : 0
                    return (
                      <div key={item.mediaType}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-foreground">{item.mediaType}</span>
                          <span className="text-muted-foreground">
                            {item.percentage.toLocaleString("en-US", { maximumFractionDigits: 1 })}% •{" "}
                            {compactCurrency(item.amount, finance.currency)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${widthPct}%` }} aria-hidden />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={onViewFullBreakdown}
                  className="mt-4 inline-flex items-center text-sm text-primary hover:underline"
                >
                  View full breakdown <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </button>
              </div>
            </section>

            {isClientHub ? (
              <>
                <Separator />
                <UpcomingBillingSection
                  clientName={clientName}
                  clientRecord={clientRecord}
                  enabled={open && isClientHub}
                />
              </>
            ) : (
              <>
                <Separator />

                <section>
                  <SectionHeader title="Recent Activity" />
                  <div className="overflow-hidden rounded-lg border border-border">
                    {txTop.length > 0 ? (
                      <div className="divide-y divide-border">
                        {txTop.map((tx) => {
                          const isPositive = tx.type === "credit" || tx.amount > 0
                          return (
                            <div key={tx.id} className="flex items-center justify-between gap-4 px-4 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-foreground">{tx.description}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                              </div>
                              <p
                                className={cn(
                                  "shrink-0 text-sm font-medium",
                                  isPositive ? "text-emerald-600" : "text-foreground"
                                )}
                              >
                                {isPositive ? "+" : "-"}
                                {fullCurrency(Math.abs(tx.amount), finance.currency)}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-sm text-muted-foreground">
                        Recent transactions will appear once billing data is connected.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onViewAllTransactions}
                    className="mt-3 inline-flex items-center text-sm text-primary hover:underline"
                  >
                    View all transactions <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </button>
                </section>
              </>
            )}

            {finance.outstandingInvoices ? (
              <>
                <Separator />
                <section>
                  <SectionHeader title="Invoicing Summary" />
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                      <ReceiptText className="h-4 w-4" />
                      Outstanding invoices
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {finance.outstandingInvoices.count.toLocaleString("en-US")} open •{" "}
                      {fullCurrency(finance.outstandingInvoices.totalAmount, finance.currency)}
                    </p>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {finance.outstandingInvoices.nextInvoiceDate ? (
                        <p>Next invoice date: {formatDate(finance.outstandingInvoices.nextInvoiceDate)}</p>
                      ) : null}
                      {finance.outstandingInvoices.paymentStatus ? (
                        <p className="capitalize">Payment status: {finance.outstandingInvoices.paymentStatus.replace("-", " ")}</p>
                      ) : null}
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border/70 px-6 py-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:space-x-0">
          <Button variant="outline" type="button" onClick={onExportCsv}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Export to CSV
          </Button>
          <div className="mt-2 flex w-full flex-col gap-2 sm:mt-0 sm:w-auto sm:flex-row sm:justify-end">
            {isClientHub ? (
              <Button variant="outline" type="button" onClick={() => setExcelDialogOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download finance document
              </Button>
            ) : null}
            <Button type="button" onClick={onDownloadReport}>
              <FileDown className="mr-2 h-4 w-4" />
              Download Full Report
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {isClientHub ? (
      <ClientFinanceExcelExportDialog
        open={excelDialogOpen}
        onOpenChange={setExcelDialogOpen}
        clientName={clientName}
        clientRecord={clientRecord}
      />
    ) : null}
    </>
  )
}
