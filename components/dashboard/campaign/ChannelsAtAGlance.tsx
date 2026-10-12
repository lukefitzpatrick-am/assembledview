"use client"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import { ProgressBar } from "@/components/ui/ProgressBar"
import { formatDateShort } from "@/lib/format/date"
import { formatMoneyCompact } from "@/lib/format/money"
import type { ChannelCoverageEntry } from "@/lib/delivery/channelCoverage"
import type { DeliveryStatus } from "@/components/dashboard/delivery/shared/statusColours"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { cn } from "@/lib/utils"

export type ChannelsAtAGlanceProps = {
  entries: ChannelCoverageEntry[]
  className?: string
  todayISO?: string
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
}: {
  label: string
  delivered: string
  planned: string
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num text-lg font-semibold tabular-nums text-foreground">{delivered}</p>
      <p className="text-xs text-muted-foreground">of planned {planned}</p>
    </div>
  )
}

function GlanceCard({ entry, todayISO }: { entry: ChannelCoverageEntry; todayISO: string }) {
  const expected = entry.expectedToDate ?? 0
  const notStarted =
    expected === 0 && entry.startsOn != null && entry.startsOn > todayISO
  const noSource = entry.status === "no_source" && entry.spendAssumed !== true
  const reporting = entry.status === "reporting" || (expected > 0 && entry.deliveredSpend != null)
  const paceStatus: DeliveryStatus | null =
    expected > 0 && entry.deliveredSpend != null
      ? deliveryStatusFromPct((entry.deliveredSpend / expected) * 100)
      : entry.deliveryStatus
  const pill: PillMeta | null = notStarted
    ? { label: "Not started", variant: "secondary" }
    : noSource
      ? null
      : entry.status === "connecting"
        ? { label: "Connecting", variant: "secondary" }
        : entry.status === "not_started"
          ? {
              label: `Starts ${formatDateShort(entry.startsOn)}`,
              variant: "secondary",
            }
          : reportingPill(paceStatus)

  const spendDelivered =
    entry.deliveredSpend === null ? "—" : formatMoneyCompact(entry.deliveredSpend)
  const barValue =
    entry.deliveredSpend != null && entry.plannedSpend > 0
      ? Math.max(0, Math.min(1, entry.deliveredSpend / entry.plannedSpend)) * 100
      : 0
  const marker =
    expected > 0 && entry.plannedSpend > 0
      ? Math.max(0, Math.min(100, (expected / entry.plannedSpend) * 100))
      : undefined
  const caption =
    noSource
      ? null
      : entry.status === "connecting"
        ? "Awaiting first report"
        : notStarted || entry.status === "not_started"
          ? `Starts ${formatDateShort(entry.startsOn)}`
          : null
  const showBar = reporting && entry.plannedSpend > 0 && !noSource && !notStarted

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
        {pill ? (
          <Badge variant={pill.variant} size="sm">
            {pill.label}
          </Badge>
        ) : (
          <p className="text-xs text-muted-foreground">No source</p>
        )}
      </div>

      <div className="mt-4 space-y-1">
        <p className="num text-lg font-semibold tabular-nums text-foreground">
          {spendDelivered} of {formatMoneyCompact(expected)} expected to date
        </p>
        <p className="text-xs text-muted-foreground">
          {formatMoneyCompact(entry.plannedSpend)} planned in total
        </p>
        {entry.spendEstimated === true ? (
          <p className="text-[11px] text-muted-foreground">Estimated</p>
        ) : null}
        {entry.spendAssumed === true ? (
          <p className="text-[11px] text-muted-foreground">Assumed spend</p>
        ) : null}
        {entry.spendModelled && entry.spendEstimated !== true ? (
          <p className="text-[11px] text-muted-foreground">modelled</p>
        ) : null}
      </div>

      <div className="mt-3">
        <MetricPair
          label={entry.deliverableLabel}
          delivered={formatImpressions(entry.deliveredImpressions)}
          planned={formatImpressions(entry.plannedImpressions)}
        />
      </div>

      {showBar ? (
        <div className="mt-4" data-progress="true">
          <ProgressBar
            value={barValue}
            max={100}
            size="pacing"
            color={progressTone(paceStatus)}
            marker={marker}
            animated={false}
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">{caption}</p>
      )}
    </article>
  )
}

export function ChannelsAtAGlance({ entries, className, todayISO }: ChannelsAtAGlanceProps) {
  if (entries.length === 0) return null
  const today = todayISO ?? getMelbourneTodayISO()
  const ordered = [...entries].sort(
    (a, b) => (b.expectedToDate ?? 0) - (a.expectedToDate ?? 0) || b.plannedSpend - a.plannedSpend,
  )

  return (
    <section aria-label="Channels at a glance" className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">Channels at a glance</h2>
        <p className="text-sm text-muted-foreground">Delivered vs expected to date</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ordered.map((entry) => (
          <GlanceCard key={entry.key} entry={entry} todayISO={today} />
        ))}
      </div>
    </section>
  )
}
