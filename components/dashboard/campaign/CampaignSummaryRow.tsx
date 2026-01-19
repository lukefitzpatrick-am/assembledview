import { SmallProgressCard, clampProgress } from "@/components/dashboard/pacing/SmallProgressCard"
import type { ReactNode } from "react"

type TimeSummary = {
  daysInCampaign?: number
  daysElapsed?: number
  daysRemaining?: number
  timeElapsedPct?: number
  startDate?: string
  endDate?: string
}

type SpendSummary = {
  budget?: number
  actualSpend?: number
  expectedSpend?: number
  expectedSpendNode?: ReactNode
  asAtDate?: string
  currency?: string
}

type CampaignSummaryRowProps = {
  time: TimeSummary
  spend: SpendSummary
  spendCardNode?: ReactNode
  hideStatus?: boolean
  accentColorTime?: string
  accentColorSpend?: string
}

function formatCurrency(value: number | undefined, currency = "AUD") {
  const num = typeof value === "number" ? value : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return ""
  const fmt = (val?: string) => {
    if (!val) return "—"
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return val
    return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" }).format(d)
  }
  return `${fmt(start)} - ${fmt(end)}`
}

export default function CampaignSummaryRow({
  time,
  spend,
  spendCardNode,
  hideStatus = false,
  accentColorTime = "#6366f1",
  accentColorSpend = "#8b5cf6",
}: CampaignSummaryRowProps) {
  const timeRatio =
    typeof time.daysElapsed === "number" && typeof time.daysInCampaign === "number" && time.daysInCampaign > 0
      ? clampProgress(time.daysElapsed / time.daysInCampaign)
      : clampProgress((time.timeElapsedPct ?? 0) / 100)

  const timeHelper =
    typeof time.daysRemaining === "number" && typeof time.daysInCampaign === "number"
      ? `${time.daysRemaining} days remaining • ${time.daysInCampaign} days total`
      : formatDateRange(time.startDate, time.endDate)

  const timeValue =
    typeof time.timeElapsedPct === "number"
      ? `${time.timeElapsedPct.toFixed(1)}%`
      : `${time.daysElapsed ?? 0}/${time.daysInCampaign ?? 0} days`

  const spendBudget = spend.budget ?? 0
  const spendActual = spend.actualSpend ?? 0
  const spendExpected = spend.expectedSpend ?? 0
  const spendValue = spend.expectedSpendNode ?? formatCurrency(spendExpected, spend.currency)
  const spendRatio = spendBudget > 0 ? clampProgress(spendActual / spendBudget) : 0
  const spendPacing =
    spendExpected > 0 ? Number(((spendActual / spendExpected) * 100).toFixed(1)) : undefined

  const spendHelper = spendBudget
    ? `Budget ${formatCurrency(spendBudget)}${spend.asAtDate ? ` • As at ${spend.asAtDate}` : ""}`
    : spend.asAtDate
      ? `As at ${spend.asAtDate}`
      : undefined

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SmallProgressCard
        label="Campaign time elapsed"
        value={timeValue}
        helper={timeHelper}
        progressRatio={timeRatio}
        pacingPct={time.timeElapsedPct}
        accentColor={accentColorTime}
        footer={formatDateRange(time.startDate, time.endDate)}
        hideStatus={hideStatus}
      />
      {spendCardNode ?? (
        <SmallProgressCard
          label="Expected spend to date"
          value={spendValue}
          helper={spendHelper}
          pacingPct={spendPacing}
          progressRatio={spendRatio}
          accentColor={accentColorSpend}
          hideStatus={hideStatus}
        />
      )}
    </div>
  )
}
