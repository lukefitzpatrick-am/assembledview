/**
 * BT-1 — non-production lines cannot publish with a blank buy type.
 *
 * Schema trim-or-null (`""` / `"  "` → null) happens in plansSaveBodySchema.
 * This module is the publish gate: after parse, before savePlanVersion.
 * Production null/blank is the documented default (C-91 / resolveBuyTypeForChannel).
 * Draft and new_version are not rejected — a planner can save mid-edit.
 */

import type { BuilderIssue } from "@/lib/mediaplan/builderIssues"

export const MISSING_BUY_TYPE = "MISSING_BUY_TYPE" as const

export const PRODUCTION_LINE_CHANNEL = "production"

export function normaliseBuyType(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

export function missingNonProductionBuyTypeLineIds(
  lineItems: Array<{
    channel: string
    buyType?: string | null
    lineItemId: string
  }>
): string[] {
  return lineItems
    .filter((l) => l.channel !== PRODUCTION_LINE_CHANNEL && l.buyType == null)
    .map((l) => l.lineItemId)
}

/** Publish intent on the server is `body.mode === "publish"` only. */
export function shouldRejectMissingBuyTypeOnSave(
  mode: "draft" | "new_version" | "publish"
): boolean {
  return mode === "publish"
}

export function formatMissingBuyTypeMessage(lineItemIds: string[]): string {
  if (lineItemIds.length === 0) return "Buy type is required to publish"
  return `Buy type is required to publish: ${lineItemIds.join(", ")}`
}

export function missingBuyTypeResponse(lineItemIds: string[]): {
  error: string
  code: typeof MISSING_BUY_TYPE
  lineItemIds: string[]
} {
  return {
    error: formatMissingBuyTypeMessage(lineItemIds),
    code: MISSING_BUY_TYPE,
    lineItemIds,
  }
}

export function missingBuyTypeBuilderIssues(lineItemIds: string[]): BuilderIssue[] {
  return lineItemIds.map((id) => ({
    id: `missing-buy-type:${id}`,
    severity: "error",
    title: `Buy type is required to publish (${id})`,
    detail: "Set a buy type on this line, then publish again.",
    stepLabel: "Media",
    fieldLabel: "Buy type",
  }))
}

export function missingBuyTypeGateResult(
  mode: "draft" | "new_version" | "publish",
  lineItems: Array<{
    channel: string
    buyType?: string | null
    lineItemId: string
  }>
):
  | { reject: false }
  | {
      reject: true
      lineItemIds: string[]
      body: {
        error: string
        code: typeof MISSING_BUY_TYPE
        lineItemIds: string[]
      }
    } {
  if (!shouldRejectMissingBuyTypeOnSave(mode)) return { reject: false }
  const lineItemIds = missingNonProductionBuyTypeLineIds(lineItems)
  if (lineItemIds.length === 0) return { reject: false }
  return {
    reject: true,
    lineItemIds,
    body: missingBuyTypeResponse(lineItemIds),
  }
}
