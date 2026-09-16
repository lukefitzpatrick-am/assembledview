"use client"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { formatDateShort } from "@/lib/format/date"
import { formatMoneyCompact } from "@/lib/format/money"
import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"
import type { DeliveryStatus } from "@/components/dashboard/delivery/shared/statusColours"
import { cn } from "@/lib/utils"

export type ChannelsAtAGlanceProps = {
  entries: ChannelCoverageEntry[]
  className?: string
}

type PillMeta = { label: string; variant: NonNullable<BadgeProps["variant"]> }

function reportingPill(status: DeliveryStatus | null): PillMeta {
  if (status === "ahead") return { label: "Ahead", variant: "ahead" }
  if (status === "behind") return { label: "Behind", variant: "behind" }
  return { label: "On track", variant: "on-track" }
}

function channelDotClass(key: string): string {
  if (key.startsWith("social-")) return "bg-channel-social"
  if (key === "search" || key.startsWith("search:")) return "bg-channel-search"
  if (key.startsWith("programmatic-ooh")) return "bg-channel-ooh"
  if (key.startsWith("programmatic-")) return "bg-channel-progDisplay"
  if (key.startsWith("bvod")) return "bg-channel-bvod"
  if (key.startsWith("digital-")) return "bg-channel-search"
  return "bg-muted-foreground"
}

function formatImpressions(value: number): string {
  if (!Number.isFinite(value)) return "—"
  return Math.round(value).toLocaleString("en-AU")
}

function progressTone(status: DeliveryStatus | null): "success" | "info" | "warning" | "default" {
  if (status === "ahead") return "success"
  if (status === "behind") return "warning"
  if (status === "on-track") return "info"
  return "default"
}

function MetricPair({
  label,
  delivered,
  planned,
  modelled,
}: {
  label: string
  delivered: string
  planned: string
  modelled?: boolean
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num text-lg font-semibold tabular-nums text-foreground">{delivered}</p>
      <p className="text-xs text-muted-foreground">of planned {planned}</p>
      {modelled ? <p className="text-[11px] text-muted-foreground">modelled</p> : null}
    </div>
  )
}

function GlanceCard({ entry }: { entry: ChannelCoverageEntry }) {
  const reporting = entry.status === "reporting"
  const pill: PillMeta =
    entry.status === "connecting"
      ? { label: "Connecting", variant: "secondary" }
      : entry.status === "not_started"
        ? {
            label: `Starts ${formatDateShort(entry.startsOn)}`,
            variant: "secondary",
          }
        : reportingPill(entry.deliveryStatus)

  const spendDelivered =
    entry.deliveredSpend === null ? "—" : formatMoneyCompact(entry.deliveredSpend)
  const impressionsRatio =
    entry.plannedImpressions > 0 ? entry.deliveredImpressions / entry.plannedImpressions : 0
  const spendRatio =
    entry.deliveredSpend !== null && entry.plannedSpend > 0
      ? entry.deliveredSpend / entry.plannedSpend
      : impressionsRatio
  const barValue = Math.max(0, Math.min(1, spendRatio)) * 100
  const caption =
    entry.status === "connecting"
      ? "Awaiting first report"
      : entry.status === "not_started"
        ? `Starts ${formatDateShort(entry.startsOn)}`
        : null

  return (
    <article
      className="rounded-card border border-border bg-card p-4 shadow-e1"
      data-coverage-key={entry.key}
      data-coverage-status={entry.status}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", channelDotClass(entry.key))}
            aria-hidden
          />
          <h3 className="truncate text-sm font-semibold text-foreground">{entry.label}</h3>
        </div>
        <Badge variant={pill.variant} size="sm">
          {pill.label}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricPair
          label="Spend"
          delivered={spendDelivered}
          planned={formatMoneyCompact(entry.plannedSpend)}
          modelled={entry.spendModelled}
        />
        <MetricPair
          label={entry.deliverableLabel}
          delivered={formatImpressions(entry.deliveredImpressions)}
          planned={formatImpressions(entry.plannedImpressions)}
        />
      </div>

      {reporting ? (
        <div className="mt-4" data-progress="true">
          <ProgressBar
            value={barValue}
            max={100}
            size="pacing"
            color={progressTone(entry.deliveryStatus)}
            animated={false}
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">{caption}</p>
      )}
    </article>
  )
}

export function ChannelsAtAGlance({ entries, className }: ChannelsAtAGlanceProps) {
  if (entries.length === 0) return null

  return (
    <section aria-label="Channels at a glance" className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">Channels at a glance</h2>
        <p className="text-sm text-muted-foreground">Delivered vs planned · updated daily</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {entries.map((entry) => (
          <GlanceCard key={entry.key} entry={entry} />
        ))}
      </div>
    </section>
  )
}
