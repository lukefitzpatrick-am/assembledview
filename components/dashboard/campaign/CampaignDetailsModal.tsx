"use client"

import Link from "next/link"
import { CalendarDays, Copy, Download, ExternalLink } from "lucide-react"

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

export interface CampaignDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaign: {
    campaignName: string
    clientName: string
    brand?: string
    mbaNumber: string
    status: string
    startDate: string
    endDate: string
    budget: number
    planVersion?: string
    planDate?: string
    poNumber?: string
    clientContact?: string
    expectedSpend?: number
    actualSpend?: number
    timeElapsedPct: number
    daysInCampaign: number
    daysElapsed: number
    daysRemaining: number
  }
  spendByChannel?: Record<string, number>
  lineItemCounts?: Record<string, number>
}

function formatCurrency(value: number | undefined, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

function formatDate(value?: string): string {
  if (!value) return "Not set"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed)
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized.includes("booked") || normalized.includes("approved")) return "bg-emerald-500/15 text-emerald-600"
  if (normalized.includes("progress") || normalized.includes("active") || normalized.includes("live")) return "bg-blue-500/15 text-blue-600"
  if (normalized.includes("complete") || normalized.includes("closed")) return "bg-slate-500/15 text-slate-600"
  return "bg-amber-500/15 text-amber-600"
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
}

export default function CampaignDetailsModal({
  open,
  onOpenChange,
  campaign,
  spendByChannel,
  lineItemCounts,
}: CampaignDetailsModalProps) {
  const elapsedPct = clampPct(campaign.timeElapsedPct)
  const expectedSpend = campaign.expectedSpend ?? 0
  const actualSpend = campaign.actualSpend ?? 0
  const utilizationPct = campaign.budget > 0 ? clampPct((actualSpend / campaign.budget) * 100) : 0

  const channels = Object.entries(spendByChannel ?? {}).sort((a, b) => b[1] - a[1])
  const totalChannelSpend = channels.reduce((sum, [, amount]) => sum + amount, 0)
  const maxChannelSpend = channels.reduce((max, [, amount]) => Math.max(max, amount), 0)
  const totalLineItems = Object.values(lineItemCounts ?? {}).reduce((sum, count) => sum + (count || 0), 0)

  const mediaPlanHref = `/mediaplans/mba/${encodeURIComponent(campaign.mbaNumber)}/edit`

  const copyMba = async () => {
    try {
      await navigator.clipboard.writeText(campaign.mbaNumber)
    } catch {
      // Keep copy action non-blocking.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/70 px-6 py-5 text-left">
          <SheetTitle>Campaign details</SheetTitle>
          <SheetDescription>Secondary metadata, timeline context, and media summary.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-152px)]">
          <div className="space-y-6 px-6 py-6">
            <section>
              <SectionHeader title="Campaign Identity" />
              <div className="rounded-lg bg-muted/50 p-4">
                <h2 className="text-2xl font-semibold leading-tight text-foreground">{campaign.campaignName}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {campaign.clientName}
                  {campaign.brand ? ` • ${campaign.brand}` : ""}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground">
                    <span>{campaign.mbaNumber}</span>
                    <button
                      type="button"
                      onClick={copyMba}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Copy MBA number"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className={cn("inline-flex rounded-full px-3 py-1.5 text-sm font-semibold capitalize", statusClass(campaign.status))}>
                    {campaign.status}
                  </span>
                </div>
              </div>
            </section>

            <Separator />

            <section>
              <SectionHeader title="Dates & Timeline" />
              <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                <div className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <CalendarDays className="h-4 w-4" />
                  Campaign timeline
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p className="text-muted-foreground">
                    Start: <span className="text-foreground">{formatDate(campaign.startDate)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    End: <span className="text-foreground">{formatDate(campaign.endDate)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Duration: <span className="text-foreground">{campaign.daysInCampaign} days</span>
                  </p>
                  <p className="text-muted-foreground">
                    Remaining:{" "}
                    <span className="text-foreground">{campaign.daysRemaining > 0 ? `${campaign.daysRemaining} days` : "Completed"}</span>
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Time elapsed</span>
                    <span>
                      {campaign.daysElapsed}/{campaign.daysInCampaign} days ({Math.round(elapsedPct)}%)
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${elapsedPct}%` }} aria-hidden />
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            <section>
              <SectionHeader title="Budget Information" />
              <div className="space-y-3">
                <article className="rounded-lg bg-muted/50 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Campaign budget</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(campaign.budget)}</p>
                </article>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <article className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected spend to date</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{formatCurrency(expectedSpend)}</p>
                  </article>
                  <article className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual spend to date</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {campaign.actualSpend !== undefined ? formatCurrency(actualSpend) : "Not available"}
                    </p>
                  </article>
                </div>
                <article className="rounded-lg bg-muted/50 p-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Budget utilization</span>
                    <span>{Math.round(utilizationPct)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${utilizationPct}%` }} aria-hidden />
                  </div>
                </article>
              </div>
            </section>

            <Separator />

            <section>
              <SectionHeader title="Plan Details" />
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p className="text-muted-foreground">
                    Plan version: <span className="text-foreground">{campaign.planVersion || "Not set"}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Plan date: <span className="text-foreground">{formatDate(campaign.planDate)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    PO number: <span className="text-foreground">{campaign.poNumber || "Not set"}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Client contact: <span className="text-foreground">{campaign.clientContact || "Not set"}</span>
                  </p>
                </div>
              </div>
            </section>

            <Separator />

            <section>
              <SectionHeader title="Media Summary" />
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="mb-3 text-sm text-muted-foreground">
                  Total line items: <span className="font-medium text-foreground">{totalLineItems}</span>
                </p>
                {channels.length > 0 ? (
                  <div className="space-y-3">
                    {channels.map(([channel, amount]) => {
                      const pct = maxChannelSpend > 0 ? (amount / maxChannelSpend) * 100 : 0
                      const share = totalChannelSpend > 0 ? (amount / totalChannelSpend) * 100 : 0
                      const count = lineItemCounts?.[channel]
                      return (
                        <div key={channel}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="text-foreground">{channel}</span>
                            <span className="text-muted-foreground">
                              {count !== undefined ? `${count} items • ` : ""}
                              {share.toFixed(1)}% • {formatCurrency(amount)}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} aria-hidden />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No media channel summary available.</p>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border/70 px-6 py-4 sm:justify-between sm:space-x-0">
          <Button type="button" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" />
            Download Campaign Summary
          </Button>
          <Button variant="outline" asChild>
            <Link href={mediaPlanHref}>
              View Full Media Plan
              <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
