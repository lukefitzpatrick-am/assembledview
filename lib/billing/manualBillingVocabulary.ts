/**
 * MB-9 / MB-21 — one vocabulary for manual billing status across header, container
 * pills, line badges, timing editor, schedule title pills, Edit Billing dot, and
 * Grand Total Matches MBA.
 *
 * Conceptual state → display word (same string everywhere):
 *   manual timing          → Manual
 *   prepaid (media)        → Media prepaid
 *   prepaid (media + fee)  → Prepaid
 *   fee adjusted           → Fee adjusted
 *   client pays            → Client pays
 *
 * Provenance axis (MB-21) — append · saved | · unsaved:
 *   pendingBillingOverrideRows drives display → unsaved
 *   billing_overrides table only                 → saved
 *   pending contradicts table for the line       → · unsaved · differs from saved
 *   Matches MBA + pending present                → Matches MBA · unsaved
 */

import {
  prebillBadgeLabelFromFlags,
  prebillBadgeTooltip,
  type PrebillBadgeFlags,
  type PrebillBadgeLabel,
} from "@/lib/billing/prebillScope"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  billingOverrideLineIdsMatch,
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi"
import { roundMoney2 } from "@/lib/format/money"

export const MANUAL_BILLING_VOCAB = {
  manualTiming: "Manual",
  prepaidMedia: "Media prepaid",
  prepaidMediaAndFee: "Prepaid",
  feeAdjusted: "Fee adjusted",
  clientPays: "Client pays",
  /** MB-21 provenance axis */
  saved: "saved",
  unsaved: "unsaved",
  differsFromSaved: "differs from saved",
  matchesMba: "Matches MBA",
  doesntMatchMba: "Doesn't match MBA",
  savedOverridesDot: "Saved billing overrides",
  unsavedOverridesDot: "Unsaved billing overrides",
} as const

export type ManualBillingStatusLabel =
  | (typeof MANUAL_BILLING_VOCAB)[keyof typeof MANUAL_BILLING_VOCAB]

export type BillingTimingProvenance = "saved" | "unsaved"

export type ManualBillingStatusKind =
  | "manualTiming"
  | "prepaidMedia"
  | "prepaidMediaAndFee"
  | "feeAdjusted"
  | "clientPays"

export function manualTimingBadgeLabel(): typeof MANUAL_BILLING_VOCAB.manualTiming {
  return MANUAL_BILLING_VOCAB.manualTiming
}

export function feeAdjustedBadgeLabel(): typeof MANUAL_BILLING_VOCAB.feeAdjusted {
  return MANUAL_BILLING_VOCAB.feeAdjusted
}

export function clientPaysBadgeLabel(): typeof MANUAL_BILLING_VOCAB.clientPays {
  return MANUAL_BILLING_VOCAB.clientPays
}

/** Line / container / timing prebill word — same as {@link prebillBadgeLabelFromFlags}. */
export function prebillStatusLabelFromFlags(
  flags: PrebillBadgeFlags
): PrebillBadgeLabel | null {
  return prebillBadgeLabelFromFlags(flags)
}

export { prebillBadgeTooltip }

/** Calm campaign-level header: "Manual billing — 1 line" / "… · unsaved". */
export function manualBillingHeaderLabel(
  manualLineCount: number,
  provenance?: BillingTimingProvenance | null
): string {
  const n = Math.max(0, Math.floor(manualLineCount))
  const base =
    n === 1 ? "Manual billing — 1 line" : `Manual billing — ${n} lines`
  if (!provenance) return base
  return withBillingTimingProvenance(base, provenance)
}

/** Append · saved | · unsaved to any MB-9 status word (or header phrase). */
export function withBillingTimingProvenance(
  baseLabel: string,
  provenance: BillingTimingProvenance
): string {
  const suffix =
    provenance === "saved"
      ? MANUAL_BILLING_VOCAB.saved
      : MANUAL_BILLING_VOCAB.unsaved
  return `${baseLabel} · ${suffix}`
}

/**
 * Full status label for a surface. When pending contradicts saved for the line,
 * appends · differs from saved so the 3 Aug shape cannot be misread as persisted.
 */
export function formatManualBillingStatusLabel(
  kind: ManualBillingStatusKind,
  provenance: BillingTimingProvenance,
  opts?: { differsFromSaved?: boolean }
): string {
  const base = MANUAL_BILLING_VOCAB[kind]
  let label = withBillingTimingProvenance(base, provenance)
  if (opts?.differsFromSaved && provenance === "unsaved") {
    label = `${label} · ${MANUAL_BILLING_VOCAB.differsFromSaved}`
  }
  return label
}

/** Grand Total reconciliation label — never implies persistence when pending exists. */
export function billingEqualsMbaLabel(opts: {
  matches: boolean
  hasPending: boolean
}): string {
  if (!opts.matches) return MANUAL_BILLING_VOCAB.doesntMatchMba
  if (opts.hasPending) {
    return withBillingTimingProvenance(MANUAL_BILLING_VOCAB.matchesMba, "unsaved")
  }
  return MANUAL_BILLING_VOCAB.matchesMba
}

export function editBillingOverrideDotLabel(
  provenance: BillingTimingProvenance
): string {
  return provenance === "saved"
    ? MANUAL_BILLING_VOCAB.savedOverridesDot
    : MANUAL_BILLING_VOCAB.unsavedOverridesDot
}

function rowLineId(row: BillingOverrideRow): string {
  return String(row.line_item_id ?? row.lineItemId ?? "").trim()
}

function rowsContainLine(rows: BillingOverrideRow[], lineItemId: string): boolean {
  return rows.some((r) => billingOverrideLineIdsMatch(rowLineId(r), lineItemId))
}

function mediaMonthsForLine(
  rows: BillingOverrideRow[],
  lineItemId: string
): { month: string; amount: number }[] {
  const row = rows.find((r) => {
    const c = String(r.component ?? "media").trim().toLowerCase() === "fee" ? "fee" : "media"
    if (c !== "media") return false
    return billingOverrideLineIdsMatch(rowLineId(r), lineItemId)
  })
  if (!row?.months) return []
  const raw = row.months
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as { month?: string; amount?: number }[]
      return Array.isArray(parsed)
        ? parsed.map((m) => ({
            month: String(m.month ?? ""),
            amount: roundMoney2(Number(m.amount) || 0),
          }))
        : []
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.map((m) => ({
    month: String(m.month ?? ""),
    amount: roundMoney2(Number(m.amount) || 0),
  }))
}

/**
 * Provenance for a line: pending (unsaved) wins when present; else table (saved).
 * Null when neither carrier has the line.
 */
export function resolveLineBillingTimingProvenance(
  lineItemId: string,
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): BillingTimingProvenance | null {
  if (rowsContainLine(pendingRows, lineItemId)) return "unsaved"
  if (rowsContainLine(tableRows, lineItemId)) return "saved"
  return null
}

/** Campaign-level provenance for title pills / Edit Billing dot / header. */
export function resolveCampaignBillingTimingProvenance(
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): BillingTimingProvenance | null {
  if (pendingRows.length > 0) return "unsaved"
  if (tableRows.length > 0) return "saved"
  return null
}

/**
 * True when pending media months for the line differ from saved table months
 * (3 Aug prepaid-on-screen vs auto-in-stores shape).
 */
export function pendingContradictsSavedForLine(
  lineItemId: string,
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): boolean {
  if (!rowsContainLine(pendingRows, lineItemId)) return false
  if (!rowsContainLine(tableRows, lineItemId)) return false
  const pending = mediaMonthsForLine(pendingRows, lineItemId)
  const saved = mediaMonthsForLine(tableRows, lineItemId)
  const months = new Set([...pending.map((m) => m.month), ...saved.map((m) => m.month)])
  for (const month of months) {
    const p = pending.find((m) => m.month === month)?.amount ?? 0
    const s = saved.find((m) => m.month === month)?.amount ?? 0
    if (Math.abs(p - s) > 0.01) return true
  }
  return false
}

/** Any pending line whose media months disagree with the saved table. */
export function pendingContradictsSavedAnywhere(
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): boolean {
  const seen = new Set<string>()
  for (const row of pendingRows) {
    const id = toBillingOverrideLineItemId(rowLineId(row))
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (pendingContradictsSavedForLine(id, pendingRows, tableRows)) return true
  }
  return false
}

export function provenanceTooltip(
  provenance: BillingTimingProvenance,
  opts?: { differsFromSaved?: boolean }
): string {
  if (provenance === "saved") {
    return "Manual billing timing is saved in billing overrides."
  }
  if (opts?.differsFromSaved) {
    return "Shown timing is unsaved and differs from saved billing overrides."
  }
  return "Manual billing timing is applied on this page but not yet saved with the plan."
}
