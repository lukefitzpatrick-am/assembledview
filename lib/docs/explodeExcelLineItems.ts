/**
 * Persist-path Excel explode. Shared by document regenerate and the
 * client-vs-persisted Buy Type tests — keep this module free of server-only.
 */

import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import {
  computeDeliverableFromMedia,
  type BuyType,
} from "@/lib/mediaplan/deliverableBudget"
import { parseMoneyInput } from "@/lib/format/money"
import type { LineItem, MediaItems } from "@/lib/generateMediaPlan"
import { excelBuyTypeFromLine } from "@/lib/mediaplan/buyTypeLabels"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"

export type MediaItemsKey = keyof MediaItems

function money(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  return parseMoneyInput(value as string | number | null | undefined) ?? 0
}

function burstDateYmd(value: unknown): string {
  if (value == null || value === "") return ""
  if (value instanceof Date) return formatBurstDateLocal(value)
  return formatBurstDateLocal(String(value))
}

export function explodeExcelLineItems(
  mediaItemsKey: MediaItemsKey,
  formLine: Record<string, unknown>,
  feePct: number,
  lineIndex: number,
): LineItem[] {
  const bursts = resolveLineItemBursts(formLine)
  if (bursts.length === 0) return []
  const lineId = String(formLine.line_item_id ?? formLine.lineItemId ?? "")
  const lineNumber = Number(formLine.line_item ?? formLine.lineItem ?? lineIndex + 1) || lineIndex + 1
  const buyType = excelBuyTypeFromLine({
    buyType: formLine.buyType as string | undefined,
  })
  const budgetIncludesFees = Boolean(formLine.budgetIncludesFees)
  const clientPaysForMedia = Boolean(formLine.clientPaysForMedia)

  return bursts.map((burst: Record<string, unknown>) => {
    if (mediaItemsKey === "production") {
      const cost = money(burst.cost)
      const amount = money(burst.amount)
      const mediaAmount = cost * amount
      return {
        market: String(formLine.market ?? ""),
        platform: "production",
        network: String(formLine.publisher ?? ""),
        creative: String(formLine.description ?? ""),
        startDate: burstDateYmd(burst.startDate ?? burst.start_date),
        endDate: burstDateYmd(burst.endDate ?? burst.end_date),
        deliverables: amount,
        buyType: "production",
        deliverablesAmount: String(cost),
        grossMedia: String(mediaAmount),
        line_item_id: lineId,
        lineItemId: lineId,
        line_item: lineNumber,
        clientPaysForMedia,
        budgetIncludesFees,
      } satisfies LineItem
    }

    const rawBudget = money(burst.budget)
    const buyAmount = money(burst.buyAmount ?? burst.buy_amount ?? burst.budget)
    const amounts = computeBurstAmounts({
      rawBudget,
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      buyType,
    })
    const recomputed = computeDeliverableFromMedia({
      buyType: buyType as BuyType,
      rawBudget,
      buyAmount,
      budgetIncludesFees,
      feePct,
    })
    const deliverableForExcel = Number.isNaN(recomputed)
      ? money(burst.calculatedValue ?? burst.deliverables ?? burst.tarps)
      : recomputed

    const startDate = burstDateYmd(burst.startDate ?? burst.start_date)
    const endDate = burstDateYmd(burst.endDate ?? burst.end_date)
    const base: LineItem = {
      market: String(formLine.market ?? ""),
      startDate,
      endDate,
      deliverables:
        mediaItemsKey === "television"
          ? money(burst.tarps ?? burst.deliverables ?? burst.calculatedValue)
          : deliverableForExcel,
      buyType,
      deliverablesAmount: String(burst.budget ?? ""),
      grossMedia: String(amounts.mediaAmount),
      clientPaysForMedia,
      budgetIncludesFees,
      line_item_id: lineId,
      lineItemId: lineId,
      line_item: lineNumber,
      buyingDemo: String(formLine.buyingDemo ?? ""),
    }

    if (mediaItemsKey === "radio") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        station: String(formLine.station ?? ""),
        bidStrategy: String(formLine.bidStrategy ?? ""),
        placement: String(formLine.placement ?? ""),
        creative: String(formLine.format ?? ""),
        duration: String(formLine.duration ?? ""),
        lineItem: lineNumber,
      }
    }
    if (mediaItemsKey === "television") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        station: String(formLine.station ?? ""),
        daypart: String(formLine.daypart ?? ""),
        placement: String(formLine.placement ?? ""),
        bidStrategy: String(formLine.bidStrategy ?? ""),
        creative: String(formLine.creative ?? ""),
        size: String(burst.size ?? ""),
        lineItem: lineNumber,
      }
    }
    if (mediaItemsKey === "ooh") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        oohFormat: String(formLine.format ?? ""),
        oohType: String(formLine.type ?? ""),
        placement: String(formLine.placement ?? ""),
        size: String(formLine.size ?? ""),
      }
    }
    if (mediaItemsKey === "cinema") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        station: String(formLine.station ?? ""),
        bidStrategy: String(formLine.bidStrategy ?? ""),
        targeting: String(formLine.placement ?? ""),
        placement: String(formLine.placement ?? ""),
        creative: String(formLine.format ?? ""),
        duration: String(formLine.duration ?? ""),
      }
    }
    if (mediaItemsKey === "newspaper" || mediaItemsKey === "magazines") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        title: String(formLine.title ?? ""),
        size: String(formLine.size ?? ""),
        placement: String(formLine.placement ?? ""),
        fixedCostMedia: Boolean(formLine.fixedCostMedia),
        lineItem: lineNumber,
      }
    }

    return {
      ...base,
      platform: String(formLine.platform ?? ""),
      site: String(formLine.site ?? ""),
      network: String(formLine.network ?? formLine.publisher ?? ""),
      bidStrategy: String(formLine.bidStrategy ?? ""),
      targeting: String(formLine.creativeTargeting ?? formLine.targeting ?? ""),
      creative: String(formLine.creative ?? ""),
      buyAmount,
      objective: String(formLine.objective ?? ""),
      campaign: String(formLine.campaign ?? ""),
    }
  })
}
