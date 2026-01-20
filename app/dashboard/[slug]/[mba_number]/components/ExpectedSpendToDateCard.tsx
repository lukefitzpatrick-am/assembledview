"use client"

import { useMemo } from "react"
import { SmallProgressCard, clampProgress } from "@/components/dashboard/pacing/SmallProgressCard"

type ExpectedSpendToDateCardProps = {
  mbaNumber: string
  campaignStart?: string
  campaignEnd?: string
  budget?: number
  actualSpend?: number
  asAtDate?: string
  currency?: string
  deliverySchedule?: unknown
  expectedSpend?: number
  hideStatus?: boolean
}

function formatCurrency(value: number | undefined, currency = "AUD") {
  const num = typeof value === "number" && Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(num)
}


export default function ExpectedSpendToDateCard({
  budget,
  asAtDate,
  currency,
  expectedSpend,
  hideStatus,
}: ExpectedSpendToDateCardProps) {

  const spendHelper = useMemo(() => {
    if (budget) {
      return `Budget ${formatCurrency(budget, currency)}${asAtDate ? ` • As at ${asAtDate}` : ""}`
    }
    return asAtDate ? `As at ${asAtDate}` : undefined
  }, [budget, currency, asAtDate])

  const chosenExpected =
    typeof expectedSpend === "number" && Number.isFinite(expectedSpend) ? expectedSpend : 0

  const progressPct =
    typeof chosenExpected === "number" &&
    Number.isFinite(chosenExpected) &&
    chosenExpected >= 0 &&
    typeof budget === "number" &&
    Number.isFinite(budget) &&
    budget > 0
      ? Number(((chosenExpected / budget) * 100).toFixed(1))
      : undefined

  const pacingPct = progressPct

  const progressRatio = typeof progressPct === "number" ? clampProgress(progressPct / 100) : 0

  const value = <span>{formatCurrency(chosenExpected, currency)}</span>

  return (
    <SmallProgressCard
      label="Expected spend to date"
      value={value}
      helper={spendHelper}
      pacingPct={pacingPct}
      progressRatio={progressRatio}
      accentColor="#8b5cf6"
      hideStatus={hideStatus}
    />
  )
}
