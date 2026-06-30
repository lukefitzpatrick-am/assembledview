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
import { formatAUD } from "@/lib/format/money"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"

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
              className="flex flex-col rounded-card border border-border bg-card p-4 shadow-e1"
            >
              <p className="text-sm font-semibold text-foreground">{block.label}</p>
              {block.loading || anyLoading ? (
                <LoadingState rows={3} className="mt-3 border-0 bg-transparent p-0 shadow-none" />
              ) : block.rows.length === 0 && !block.error ? (
                <EmptyState
                  title="No billing rows"
                  message="No billing rows for this month."
                  className="mt-3 min-h-[140px] border-border bg-surface-panel px-4 py-6"
                />
              ) : (
                <div className="mt-3 space-y-3">
                  {block.error ? (
                    <ErrorState
                      title="Partial billing data"
                      message={block.error}
                      className="px-3 py-3"
                    />
                  ) : null}
                  {block.rows.length === 0 ? (
                    <EmptyState
                      title="No line items"
                      message="No line items for this month."
                      className="min-h-[120px] border-border bg-surface-panel px-4 py-6"
                    />
                  ) : null}
                  {block.rows.map((row) => {
                    return (
                      <div key={`${block.key}-${row.label}`}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-foreground">{row.label}</span>
                          <span className="num shrink-0 text-muted-foreground">{formatAudCompact(row.amount)}</span>
                        </div>
                        <ProgressBar value={row.amount} max={maxAmt} size="sm" color="info" animated={false} />
                      </div>
                    )
                  })}
                  {block.rows.length > 0 ? (
                    <p className="border-t border-border/60 pt-2 text-xs font-medium text-foreground">
                      Total{" "}
                      <span className="num float-right">{formatAUD(block.rows.reduce((s, r) => s + r.amount, 0))}</span>
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
