import { Badge, type BadgeProps } from "@/components/ui/badge"
import { statusSentence } from "@/lib/dashboard/statusSentence"
import { formatDateShort } from "@/lib/format/date"
import { formatMoneyCompact } from "@/lib/format/money"
import { deliveryStatusFromPct } from "@/lib/pacing/deliveryStatusFromPct"
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
  /**
   * Impressions expected for the pacing window on reporting channels (to
   * Melbourne yesterday, narrowed by the date filter). When set, the
   * impressions bar and caption read delivered against it instead of the
   * planned total.
   */
  expectedImpressions?: number
  hasDelivery: boolean
  /** Last day inside the delivered and expected figures (Melbourne yesterday or the filter end). */
  deliveredAsOf?: string
  /** "to date" (no filter) or "in period" (date filter). Defaults to "to date". */
  periodLabel?: "to date" | "in period"
  channelsReporting?: number
  channelsTotal?: number
  aheadChannelName?: string | null
  cpmActual?: number
  cpmPlanned?: number
  /**
   * Conversions for the pacing window when the client's switch is on: the
   * headline (Purchases, Leads or Conversions), then Revenue and ROAS when
   * the client shows revenue. Omitted when the switch is off.
   */
  conversionCells?: ReadonlyArray<{ key: string; label: string; value: string }>
  className?: string
}

type PillMeta = { label: string; variant: NonNullable<BadgeProps["variant"]> }

/** Delivery band → existing Where-we-are labels. `deliveryStatusFromPct` does not emit over-pacing. */
const PILL_BY_BAND: Record<SpendPacingBand, PillMeta> = {
  ahead: { label: "Ahead of plan", variant: "ahead" },
  "on-track": { label: "On track", variant: "on-track" },
  behind: { label: "Behind plan on spend", variant: "behind" },
  "over-pacing": { label: "Critical", variant: "critical" },
  "no-data": { label: "No data", variant: "secondary" },
}

/** Delivered ÷ the schedule expected the card prints. Bands are `PACING_STATUS_THRESHOLDS`. ≥115 maps to Ahead here. */
function deliveryBand(
  actualSpend: number | undefined,
  expectedSpend: number | undefined,
): SpendPacingBand | null {
  if (typeof actualSpend !== "number" || !Number.isFinite(actualSpend)) return null
  if (
    typeof expectedSpend !== "number" ||
    !Number.isFinite(expectedSpend) ||
    expectedSpend <= 0
  ) {
    return "no-data"
  }
  return deliveryStatusFromPct((actualSpend / expectedSpend) * 100)
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

/** Whole-percent label. Capped at 0 to 100% unless `uncapped` (ahead shows as ahead). */
function pctLabel(value: number, uncapped = false): string {
  const ratio = uncapped ? Math.max(0, Number.isFinite(value) ? value : 0) : clamp01(value)
  return `${Math.round(ratio * 100)}%`
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
  budget,
  actualSpend,
  expectedSpend,
  deliveredImpressions,
  plannedImpressions,
  expectedImpressions,
  hasDelivery,
  deliveredAsOf,
  periodLabel = "to date",
  channelsReporting,
  channelsTotal,
  aheadChannelName,
  cpmActual,
  cpmPlanned,
  conversionCells,
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
  const impressionsAgainstExpected =
    typeof expectedImpressions === "number" && Number.isFinite(expectedImpressions) && expectedImpressions > 0
  const impressionsPct = ratio(
    deliveredImpressions,
    impressionsAgainstExpected ? expectedImpressions : plannedImpressions,
  )

  const band = deliveryBand(spendKnown ? actualSpend : undefined, expectedSpend)
  const pill = band ? PILL_BY_BAND[band] : null

  const sentence = statusSentence({
    pacingStatus: band ?? "no-data",
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
  const impressionsBasis = impressionsAgainstExpected ? `expected ${periodLabel}` : "planned"
  // Against expected the figure is not capped at 100%: ahead shows as ahead.
  const impressionsPctText =
    impressionsAgainstExpected &&
    typeof deliveredImpressions === "number" &&
    Number.isFinite(deliveredImpressions)
      ? pctLabel(Math.max(0, deliveredImpressions) / expectedImpressions!, true)
      : pctLabel(impressionsPct)
  const impressionsCaption =
    typeof channelsTotal === "number" && channelsTotal > 0
      ? `${impressionsPctText} of ${impressionsBasis} (channels reporting)`
      : `${impressionsPctText} of ${impressionsBasis} (all line items)`

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
            <Badge variant={pill.variant} size="md" data-pacing-status={band}>
              {pill.label}
            </Badge>
          ) : null}
          <p className="text-sm text-foreground">{sentence}</p>
          {deliveredAsOf ? (
            <p className="text-xs text-muted-foreground">
              Delivery to {formatDateShort(deliveredAsOf)}
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
            label={`Delivered ${periodLabel}`}
            value={spendKnown ? formatMoneyCompact(actualSpend) : "—"}
            bar={spendVsExpected}
            barClassName={band ? DELIVERED_BAR[band] : "bg-am-context"}
            caption={`${pctLabel(spendVsExpected)} of expected ${expectedCaptionMoney}`}
          />
          <StatCell
            testId="expected-by-now"
            label={`Expected media ${periodLabel}`}
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
          {conversionCells && conversionCells.length > 0 ? (
            <div
              className={cn(
                "col-span-2 grid gap-4",
                showImpressions ? "lg:col-span-4" : "lg:col-span-3",
                conversionCells.length > 1 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1",
              )}
              data-stat="conversions-row"
            >
              {conversionCells.map((cell) => (
                <div
                  key={cell.key}
                  className="min-w-0 space-y-1.5 rounded-card border border-border bg-background p-3"
                  data-stat={`conversion-${cell.key}`}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {cell.key === "roas" ? cell.label : `${cell.label} ${periodLabel}`}
                  </p>
                  <p className="num text-2xl font-bold tabular-nums text-foreground">{cell.value}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
