import { useCallback, useMemo } from "react"

import type { ManualBillingMediaSection } from "@/lib/billing/buildManualBillingSpreadsheetRegistry"
import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import type { ManualBillingSpreadsheetCallbacks } from "@/components/billing/manualBillingSpreadsheetContext"
import type { BillingLineMode } from "@/lib/billing/applyBillingLineMode"

type CostBucket = "fee" | "adServing" | "production"

const noopSetLineBillingMode = () => {}

export type UseManualBillingSpreadsheetCallbacksArgs = Readonly<{
  manualBillingMonths: BillingMonth[]
  setManualBillingMonths: (months: BillingMonth[]) => void
  handleManualBillingChange: (
    index: number,
    type: "media" | "fee" | "adServing" | "production" | "lineItem",
    rawValue: string,
    mediaKey?: string,
    lineItemId?: string,
    monthYear?: string
  ) => void
  setLineBillingMode?: (lineItemId: string, mode: BillingLineMode) => void
}>

export function useManualBillingSpreadsheetCallbacks({
  manualBillingMonths,
  setManualBillingMonths,
  handleManualBillingChange,
  setLineBillingMode = noopSetLineBillingMode,
}: UseManualBillingSpreadsheetCallbacksArgs): ManualBillingSpreadsheetCallbacks {
  const getLineItemAmount = useCallback(
    (mediaKey: string, lineItemId: string, monthYear: string) => {
      const list = manualBillingMonths[0]?.lineItems?.[
        mediaKey as keyof NonNullable<BillingMonth["lineItems"]>
      ] as BillingLineItem[] | undefined
      const li = list?.find((l) => l.id === lineItemId)
      return li?.monthlyAmounts?.[monthYear] ?? 0
    },
    [manualBillingMonths]
  )

  const getCostFieldRaw = useCallback(
    (rowId: string, monthYear: string) => {
      const month = manualBillingMonths.find((m) => m.monthYear === monthYear)
      if (!month) return ""
      if (rowId === "fee") return month.feeTotal ?? ""
      if (rowId === "adServing") return month.adservingTechFees ?? ""
      if (rowId === "production") return month.production ?? "$0.00"
      return ""
    },
    [manualBillingMonths]
  )

  const onLineItemPaste = useCallback(
    (mediaKey: string, lineItemId: string, monthYear: string, raw: string) => {
      const monthIndex = manualBillingMonths.findIndex((m) => m.monthYear === monthYear)
      if (monthIndex < 0) return
      handleManualBillingChange(monthIndex, "lineItem", raw, mediaKey, lineItemId, monthYear)
    },
    [handleManualBillingChange, manualBillingMonths]
  )

  const onLineItemClear = useCallback(
    (mediaKey: string, lineItemId: string, monthYear: string) => {
      onLineItemPaste(mediaKey, lineItemId, monthYear, "0")
    },
    [onLineItemPaste]
  )

  const onCostPaste = useCallback(
    (rowId: string, monthYear: string, raw: string) => {
      const monthIndex = manualBillingMonths.findIndex((m) => m.monthYear === monthYear)
      if (monthIndex < 0) return
      const bucket = rowId as CostBucket
      if (bucket === "production") {
        handleManualBillingChange(monthIndex, "production", raw, "production")
      } else {
        handleManualBillingChange(monthIndex, bucket, raw)
      }
    },
    [handleManualBillingChange, manualBillingMonths]
  )

  const onCostClear = useCallback(
    (rowId: string, monthYear: string) => {
      onCostPaste(rowId, monthYear, "0")
    },
    [onCostPaste]
  )

  return useMemo(
    () => ({
      getLineItemAmount,
      getCostFieldRaw,
      setLineBillingMode,
      onLineItemPaste,
      onLineItemClear,
      onCostPaste,
      onCostClear,
    }),
    [
      getLineItemAmount,
      getCostFieldRaw,
      setLineBillingMode,
      onLineItemPaste,
      onLineItemClear,
      onCostPaste,
      onCostClear,
    ]
  )
}

export function buildManualBillingMediaSections(
  mediaTypes: readonly { name: string; label: string; component: unknown }[],
  watchedMediaTypesMap: Record<string, boolean>,
  mediaKeyMap: Record<string, string>,
  manualBillingMonths: BillingMonth[]
): ManualBillingMediaSection[] {
  const firstMonth = manualBillingMonths[0]
  if (!firstMonth?.lineItems) return []

  return mediaTypes
    .filter((medium) => medium.name !== "mp_production")
    .filter((medium) => watchedMediaTypesMap[medium.name] && medium.component)
    .map((medium) => {
      const mediaKey = mediaKeyMap[medium.name]!
      const lineItems =
        (firstMonth.lineItems?.[mediaKey as keyof typeof firstMonth.lineItems] as
          | BillingLineItem[]
          | undefined) ?? []
      return {
        accordionValue: `manual-billing-${medium.name}`,
        mediaKey,
        lineItems,
      }
    })
    .filter((s) => s.lineItems.length > 0)
}

export function defaultManualBillingAccordionExpanded(
  mediaSections: readonly ManualBillingMediaSection[]
): string[] {
  return [...mediaSections.map((s) => s.accordionValue), "manual-billing-costs"]
}
