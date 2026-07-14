/**
 * Fingerprint of the line inputs (incl. attached overrides) used to generate
 * a billing schedule. Stored on `media_plan_versions.inputs_hash` on clean save.
 */

import { createHash } from "crypto"

import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { roundMoney2 } from "@/lib/format/money"

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(obj).sort()) {
        out[k] = obj[k]
      }
      return out
    }
    return v
  })
}

function normalizeLineForHash(line: LineItemInput) {
  return {
    lineItemId: line.lineItemId,
    mediaType: line.mediaType,
    buyType: line.buyType,
    rate: roundMoney2(line.rate),
    enteredAmount: roundMoney2(line.enteredAmount),
    budgetIncludesFees: line.budgetIncludesFees,
    clientPaysForMedia: line.clientPaysForMedia,
    feePct: line.feePct ?? null,
    deliverablesManual: line.deliverablesManual ?? null,
    approval: line.approval,
    bursts: (line.bursts ?? []).map((b) => ({
      startDate: String(b.startDate),
      endDate: String(b.endDate),
      budget: b.budget ?? null,
      buyAmount: b.buyAmount ?? null,
      deliverables: b.deliverables ?? null,
      calculatedValue: b.calculatedValue ?? null,
      adServingRatePct: b.adServingRatePct ?? null,
      adServingImpressions: b.adServingImpressions ?? null,
    })),
    billingOverride: line.billingOverride
      ? {
          mode: line.billingOverride.mode,
          reason: line.billingOverride.reason ?? null,
          dateBasis: line.billingOverride.dateBasis,
          months: line.billingOverride.months.map((m) => ({
            month: m.month,
            amount: roundMoney2(m.amount),
          })),
        }
      : null,
    feeOverride: line.feeOverride
      ? {
          mode: line.feeOverride.mode,
          reason: line.feeOverride.reason ?? null,
          dateBasis: line.feeOverride.dateBasis,
          component: line.feeOverride.component ?? "fee",
          months: line.feeOverride.months.map((m) => ({
            month: m.month,
            amount: roundMoney2(m.amount),
          })),
        }
      : null,
  }
}

export function computeBillingInputsHash(lineItems: LineItemInput[]): string {
  const payload = stableStringify({
    lines: lineItems.map(normalizeLineForHash).sort((a, b) =>
      a.lineItemId.localeCompare(b.lineItemId)
    ),
  })
  return createHash("sha256").update(payload).digest("hex")
}
