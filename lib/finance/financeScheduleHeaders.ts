/**
 * Finance reads of the newer billing blob shape (`BillingMonth.lineItems`,
 * keyed by media type) — Luke, 23 Oct 2026.
 *
 * - Old `mediaTypes` months go through `extractLineItemsFromBillingSchedule`
 *   unchanged, so their export output stays byte-identical.
 * - `lineItems` months go through `financeMediaLinesFromBillingMonth`
 *   (production is skipped there; it bills once as the header row).
 * - Placeholder headers (header1 = media key, header2 = line id) are
 *   relabelled from the plan line via `relabelPlaceholderHeaders` before the
 *   billing-agency lookup. Real header names are never changed.
 */

import { billingLinesById, relabelPlaceholderHeaders } from "@/lib/billing/relabelPlaceholderHeaders"
import type { BillingMonth } from "@/lib/billing/types"
import { financeMediaLinesFromBillingMonth } from "@/lib/finance/scheduleMonthFinanceExtract"
import {
  extractLineItemsFromBillingSchedule,
  matchMonthYear,
  type FinanceLineItem,
} from "@/lib/finance/utils"
import type { PublisherLookup } from "@/lib/publisher/resolvePublisherName"

/** One plan line as finance needs it for schedule headers. */
export type FinancePlanLine = {
  lineItemId: string
  publisher: string | null
  platform: string | null
  bidStrategy: string | null
  attrs: Record<string, unknown> | null
}

/** Attached by `hydrateVersionsFinanceScheduleSource`: plan lines by line id. */
export const FINANCE_PLAN_LINES_KEY = "__financePlanLinesById" as const

/** Index plan lines by id in the shape `relabelPlaceholderHeaders` reads. */
export function financePlanLinesById(lines: readonly FinancePlanLine[]): Record<string, unknown> {
  return billingLinesById([
    lines.map((l) => ({
      lineItemId: l.lineItemId,
      publisher: l.publisher,
      platform: l.platform,
      bidStrategy: l.bidStrategy,
      bid_strategy: l.bidStrategy,
      attrs: l.attrs,
    })),
  ])
}

export function attachFinancePlanLines(
  version: Record<string, unknown>,
  lines: readonly FinancePlanLine[],
): void {
  version[FINANCE_PLAN_LINES_KEY] = financePlanLinesById(lines)
}

/** Plan lines by id attached by hydrate; empty when hydrate did not run or the read failed. */
export function getFinancePlanLinesById(version: Record<string, unknown>): Record<string, unknown> {
  const raw = version[FINANCE_PLAN_LINES_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

/** Relabel placeholder headers on one billing month. Amounts are untouched. */
export function relabelFinanceBillingMonth(
  month: BillingMonth,
  linesById: Record<string, unknown>,
): BillingMonth {
  if (!month.lineItems || Object.keys(linesById).length === 0) return month
  return relabelPlaceholderHeaders([month], linesById)[0] ?? month
}

function scheduleMonths(billingSchedule: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(billingSchedule)) return billingSchedule as Record<string, unknown>[]
  if (billingSchedule && typeof billingSchedule === "object") {
    const months = (billingSchedule as { months?: unknown }).months
    if (Array.isArray(months)) return months as Record<string, unknown>[]
  }
  return null
}

function findMonthEntry(
  billingSchedule: unknown,
  year: number,
  month: number,
): Record<string, unknown> | null {
  const months = scheduleMonths(billingSchedule)
  if (!months) return null
  // Same lookup as extractLineItemsFromBillingSchedule (first match wins).
  return (
    months.find((entry) =>
      matchMonthYear(
        (entry.monthYear || entry.month_year || entry.month || entry.month_label) as string,
        year,
        month,
      ),
    ) ?? null
  )
}

function isLineItemsShape(entry: Record<string, unknown>): boolean {
  if (Array.isArray(entry.mediaTypes)) return false
  const li = entry.lineItems
  return (
    typeof entry.monthYear === "string" &&
    li != null &&
    typeof li === "object" &&
    !Array.isArray(li)
  )
}

/**
 * Finance export media lines for one calendar month, for either blob shape.
 * Old shape: exactly `extractLineItemsFromBillingSchedule`.
 */
export function extractFinanceExportMediaLines(
  billingSchedule: unknown,
  year: number,
  month: number,
  publisherMap: PublisherLookup<unknown>,
  linesById: Record<string, unknown> = {},
): FinanceLineItem[] {
  const entry = findMonthEntry(billingSchedule, year, month)
  if (!entry || !isLineItemsShape(entry)) {
    return extractLineItemsFromBillingSchedule(billingSchedule, year, month, publisherMap)
  }
  const labelled = relabelFinanceBillingMonth(entry as unknown as BillingMonth, linesById)
  return financeMediaLinesFromBillingMonth(
    labelled,
    publisherMap as PublisherLookup<{ billingagency?: string | null }>,
  )
}
