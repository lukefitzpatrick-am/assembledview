"use client"

import { useEffect, useState } from "react"
import { Clock } from "lucide-react"

import { MetricCard } from "@/components/ui/MetricCard"
import { Skeleton } from "@/components/ui/skeleton"
import type { MbaTimeSummary } from "@/lib/myhours/timeSummary"
import { cn } from "@/lib/utils"

type Props = {
  mbaNumber: string
  className?: string
}

/**
 * Admin-only hours-to-date for the campaign MBA (Codex-gated API).
 * Hidden when the API returns 401/403/404 — hours are commercially sensitive.
 */
export function CampaignHoursWidget({ mbaNumber, className }: Props) {
  const [data, setData] = useState<MbaTimeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(
          `/api/codex/time/summary?mba=${encodeURIComponent(mbaNumber.trim())}`
        )
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          if (!cancelled) setHidden(true)
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as MbaTimeSummary
        if (!cancelled) setData(body)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mbaNumber])

  if (hidden) return null

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-card border border-border bg-card p-4 shadow-e1",
          className
        )}
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-8 w-20" />
        <Skeleton className="mt-3 h-16 w-full" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className={cn("space-y-3", className)}>
      <MetricCard
        label="Hours to date"
        value={data.total_hours}
        unit="h"
        size="md"
        icon={Clock}
        sparklineData={data.sparkline_weeks}
        accent="bg-primary"
      />
      {data.by_member.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Member</th>
                <th className="px-3 py-2 text-right font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {data.by_member.map((m) => (
                <tr
                  key={m.member_email}
                  className="border-t border-border/30 interactive-row"
                >
                  <td className="px-3 py-2 text-foreground">{m.member_email}</td>
                  <td className="num px-3 py-2 text-right text-foreground">
                    {m.hours}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hours logged yet for this MBA.
        </p>
      )}
    </div>
  )
}
