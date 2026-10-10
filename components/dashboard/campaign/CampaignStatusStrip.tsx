import { Badge, type BadgeProps } from "@/components/ui/badge"
import { campaignPacingVerdict } from "@/lib/dashboard/campaignPacingVerdict"
import { statusSentence } from "@/lib/dashboard/statusSentence"
import { formatDateShort } from "@/lib/format/date"
import { formatMoneyCompact } from "@/lib/format/money"
import type { SpendPacingBand } from "@/lib/pacing/status"
import { cn } from "@/lib/utils"

export type CampaignStatusStripProps = {
  daysElapsed: number
  daysInCampaign: number
  daysRemaining: number
  /** 0–100 campaign elapsed (same basis as CampaignSummaryRow). */
  timeElapsedPct: number
  startDate: string
  endDate: string
  budget: number
  actualSpend?: number
  expectedSpend?: number
  deliveredImpressions?: number
  plannedImpressions?: number
  hasDelivery: boolean
  deliveredAsOf?: string
  channelsReporting?: number
  channelsTotal?: number
  aheadChannelName?: string | null
  cpmActual?: number
  cpmPlanned?: number
  className?: string
}

type PillMeta = { label: string; variant: NonNullable<BadgeProps["variant"]> }

const PILL_BY_BAND: Record<SpendPacingBand, PillMeta> = {
  ahead: { label: "Ahead of plan", variant: "ahead" },
  "on-track": { label: "On track", variant: "on-track" },
  behind: { label: "Behind plan on spend", variant: "behind" },
  "over-pacing": { label: "Critical", variant: "critical" },
  "no-data": { label: "No data", variant: "secondary" },
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function ratio(numerator: number | undefined, denominator: number | undefined): number {
  if (
    typeof numerator !== "number" ||
    typeof denominator !== "number" ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return 0
  }
  return clamp01(numerator / denominator)
}

function pctLabel(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`
}

function formatImpressions(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return Math.round(value).toLocaleString("en-AU")
}

function MiniBar({ value, barClassName }: { value: number; barClassName: string }) {
  const width = `${Math.round(clamp01(value) * 1000) / 10}%`
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--fill-track)]"
      aria-hidden
    >
      <div className={cn("h-full rounded-full", barClassName)} style={{ width }} />
    </div>
  )
}

function StatCell({
  label,
  value,
  bar,
  barClassName,
  caption,
  testId,
}: {
  label: string
  value: string
  bar: number
  barClassName: string
  caption: string
  testId: string
}) {
  return (
    <div className="min-w-0 space-y-1.5 rounded-card border border-border bg-background p-3" data-stat={testId}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <MiniBar value={bar} barClassName={barClassName} />
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

const DELIVERED_BAR: Record<SpendPacingBand, string> = {
  ahead: "bg-pacing-ahead",
  "on-track": "bg-pacing-on-track",
  behind: "bg-pacing-behind",
  "over-pacing": "bg-pacing-critical",
  "no-data": "bg-am-context",
}

export function CampaignStatusStrip({
  daysElapsed,
  daysInCampaign,
  daysRemaining,
  timeElapsedPct,
  startDate,
  endDate,
  budget,
  actualSpend,
  expectedSpend,
  deliveredImpressions,
  plannedImpressions,
  hasDelivery,
  deliveredAsOf,
  channelsReporting,
  channelsTotal,
  aheadChannelName,
  cpmActual,
  cpmPlanned,
  className,
}: CampaignStatusStripProps) {
  const dayCurrent = Math.max(0, Math.round(daysElapsed))
  const dayTotal = Math.max(0, Math.round(daysInCampaign))
  const daysRem = Math.max(0, Math.round(daysRemaining))
  const elapsedRatio = clamp01(
    Number.isFinite(timeElapsedPct) ? timeElapsedPct / 100 : 0,
  )

  const spendKnown = typeof actualSpend === "number" && Number.isFinite(actualSpend)
  const expectedKnown = typeof expectedSpend === "number" && Number.isFinite(expectedSpend)

  const spendVsExpected = ratio(spendKnown ? actualSpend : undefined, expectedSpend)
  const spendVsBudget = ratio(spendKnown ? actualSpend : undefined, budget)
  const spendPct = expectedKnown && expectedSpend > 0 ? spendVsExpected : spendVsBudget
  const expectedVsBudget = ratio(expectedSpend, budget)
  const impressionsPct = ratio(deliveredImpressions, plannedImpressions)

  const pacingResolved = spendKnown
    ? campaignPacingVerdict({
        budget,
        startDate,
        endDate,
        spendToDate: actualSpend,
        asOfDate: deliveredAsOf,
      })
    : null
  const pill = pacingResolved ? PILL_BY_BAND[pacingResolved.status] : null

  const sentence = statusSentence({
    pacingStatus: spendKnown ? pacingResolved?.status ?? "no-data" : "no-data",
    spendPct,
    impressionsPct,
    channelsReporting,
    channelsTotal,
    aheadChannelName,
    cpmActual,
    cpmPlanned,
    expectedSpend,
    actualSpend,
  })

  const showImpressions = hasDelivery
  const expectedCaptionMoney = formatMoneyCompact(expectedKnown ? expectedSpend : budget)
  const budgetCaptionMoney = formatMoneyCompact(budget)
  const impressionsCaption =
    typeof channelsTotal === "number" && channelsTotal > 0
      ? `${pctLabel(impressionsPct)} of planned (channels reporting)`
      : `${pctLabel(impressionsPct)} of planned (all line items)`

  return (
    <section
      aria-label="Where we are"
      className={cn(
        "rounded-card border border-border bg-card p-4 sm:p-5",
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="min-w-0 space-y-3 md:col-span-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Day {dayCurrent} of {dayTotal}
          </p>
          {pill ? (
            <Badge variant={pill.variant} size="md" data-pacing-status={pacingResolved?.status}>
              {pill.label}
            </Badge>
          ) : null}
          <p className="text-sm text-foreground">{sentence}</p>
          {deliveredAsOf ? (
            <p className="text-xs text-muted-foreground">
              Last updated {formatDateShort(deliveredAsOf)}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "grid gap-4 md:col-span-8",
            showImpressions ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3",
          )}
        >
          <StatCell
            testId="delivered-to-date"
            label="Delivered to date"
            value={spendKnown ? formatMoneyCompact(actualSpend) : "—"}
            bar={spendVsExpected}
            barClassName={pacingResolved ? DELIVERED_BAR[pacingResolved.status] : "bg-am-context"}
            caption={`${pctLabel(spendVsExpected)} of expected ${expectedCaptionMoney}`}
          />
          <StatCell
            testId="expected-by-now"
            label="Expected media to date"
            value={expectedKnown ? formatMoneyCompact(expectedSpend) : "—"}
            bar={expectedVsBudget}
            barClassName="bg-am-forest"
            caption={`${pctLabel(expectedVsBudget)} of ${budgetCaptionMoney} budget`}
          />
          {showImpressions ? (
            <StatCell
              testId="impressions"
              label="Impressions"
              value={formatImpressions(deliveredImpressions)}
              bar={impressionsPct}
              barClassName="bg-am-sky"
              caption={impressionsCaption}
            />
          ) : null}
          <StatCell
            testId="time-elapsed"
            label="Time elapsed"
            value={pctLabel(elapsedRatio)}
            bar={elapsedRatio}
            barClassName="bg-am-forest"
            caption={`${daysRem} ${daysRem === 1 ? "day" : "days"} remaining`}
          />
        </div>
      </div>
    </section>
  )
}
