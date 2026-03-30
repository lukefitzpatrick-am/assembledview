"use client"

import { useEffect, useMemo, useState } from "react"
import { addMonths, format, startOfMonth } from "date-fns"
import type { FinanceCampaignData } from "@/lib/finance/utils"
import {
  aggregateMediaLineItemsByType,
  aggregateServiceRowsByService,
  combineFinanceCampaignLists,
  sumCampaignTotals,
} from "@/lib/finance/upcomingBillingAggregate"
import { cn } from "@/lib/utils"

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

function formatAudCompact(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function formatAudFull(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value)
}

type MonthBlock = {
  key: string
  label: string
  rows: { label: string; amount: number }[]
  error?: string
  loading: boolean
}

function threeMonthKeysFromNow(): string[] {
  const s = startOfMonth(new Date())
  return [0, 1, 2].map((i) => format(addMonths(s, i), "yyyy-MM"))
}

function SectionHeader({ title }: { title: string }) {
  return <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
}

export function UpcomingBillingSection({
  clientName,
  clientRecord,
  enabled,
}: {
  clientName: string
  clientRecord: Record<string, unknown> | null
  enabled: boolean
}) {
  const monthKeys = useMemo(() => threeMonthKeysFromNow(), [])
  const retainer = readNumberField(clientRecord, "monthlyretainer")

  const [blocks, setBlocks] = useState<MonthBlock[]>(() =>
    monthKeys.map((key) => ({
      key,
      label: format(new Date(`${key}-01T12:00:00`), "MMMM yyyy"),
      rows: [],
      loading: false,
    }))
  )

  useEffect(() => {
    if (!enabled || !clientName.trim()) {
      setBlocks(
        monthKeys.map((key) => ({
          key,
          label: format(new Date(`${key}-01T12:00:00`), "MMMM yyyy"),
          rows: [],
          loading: false,
        }))
      )
      return
    }

    let cancelled = false
    setBlocks(
      monthKeys.map((key) => ({
        key,
        label: format(new Date(`${key}-01T12:00:00`), "MMMM yyyy"),
        rows: [],
        loading: true,
      }))
    )

    const enc = encodeURIComponent(clientName)

    ;(async () => {
      const results = await Promise.all(
        monthKeys.map(async (ym) => {
          try {
            const [mediaRes, sowRes] = await Promise.all([
              fetch(`/api/finance/data?month=${ym}&client=${enc}`),
              fetch(`/api/finance/sow?month=${ym}&client=${enc}`),
            ])

            const warnings: string[] = []
            let media: FinanceCampaignData[] = []
            let sow: FinanceCampaignData[] = []

            if (mediaRes.ok) {
              const mediaJson = await mediaRes.json()
              media = combineFinanceCampaignLists(
                mediaJson.bookedApproved || [],
                mediaJson.other || []
              )
            } else {
              warnings.push("Media unavailable")
            }

            if (sowRes.ok) {
              const sowJson = await sowRes.json()
              sow = combineFinanceCampaignLists(sowJson.bookedApproved || [], sowJson.other || [])
            } else {
              warnings.push("Scopes unavailable")
            }

            return {
              ym,
              error: warnings.length > 0 ? warnings.join(" · ") : undefined,
              media,
              sow,
            }
          } catch {
            return {
              ym,
              error: "Request failed.",
              media: [] as FinanceCampaignData[],
              sow: [] as FinanceCampaignData[],
            }
          }
        })
      )

      if (cancelled) return

      setBlocks(
        results.map((r) => {
          const mediaByType = aggregateMediaLineItemsByType(r.media)
          const fees = aggregateServiceRowsByService(r.media)
          const sowTotal = sumCampaignTotals(r.sow)

          const rows: { label: string; amount: number }[] = []

          for (const m of mediaByType) {
            rows.push({ label: m.mediaType, amount: m.amount })
          }
          for (const f of fees) {
            rows.push({ label: f.service, amount: f.amount })
          }
          if (retainer > 0) {
            rows.push({ label: "Retainer", amount: retainer })
          }
          if (sowTotal > 0) {
            rows.push({ label: "Scopes of work", amount: sowTotal })
          }

          return {
            key: r.ym,
            label: format(new Date(`${r.ym}-01T12:00:00`), "MMMM yyyy"),
            rows,
            error: r.error,
            loading: false,
          }
        })
      )
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, clientName, monthKeys, retainer])

  const anyLoading = enabled && blocks.some((b) => b.loading)

  return (
    <section>
      <SectionHeader title="Upcoming billing" />
      <p className="mb-4 text-xs text-muted-foreground">
        Estimated billing by media and fees for this month and the next two, from media plans, scopes, and retainer on
        file.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {blocks.map((block) => {
          const maxAmt = block.rows.reduce((m, r) => Math.max(m, r.amount), 0)
          return (
            <article
              key={block.key}
              className="flex flex-col rounded-xl border border-border/80 bg-muted/30 p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-foreground">{block.label}</p>
              {block.loading || anyLoading ? (
                <div className="mt-3 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
                  ))}
                </div>
              ) : block.rows.length === 0 && !block.error ? (
                <p className="mt-3 text-xs text-muted-foreground">No billing rows for this month.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {block.error ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{block.error}</p>
                  ) : null}
                  {block.rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No line items for this month.</p>
                  ) : null}
                  {block.rows.map((row) => {
                    const widthPct = maxAmt > 0 ? Math.min(100, (row.amount / maxAmt) * 100) : 0
                    return (
                      <div key={`${block.key}-${row.label}`}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-foreground">{row.label}</span>
                          <span className="shrink-0 text-muted-foreground">{formatAudCompact(row.amount)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full bg-blue-500")}
                            style={{ width: `${widthPct}%` }}
                            aria-hidden
                          />
                        </div>
                      </div>
                    )
                  })}
                  {block.rows.length > 0 ? (
                    <p className="border-t border-border/60 pt-2 text-xs font-medium text-foreground">
                      Total{" "}
                      <span className="float-right">{formatAudFull(block.rows.reduce((s, r) => s + r.amount, 0))}</span>
                    </p>
                  ) : null}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
