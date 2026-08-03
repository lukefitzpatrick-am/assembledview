/**
 * MB-9 / MB-21 / MB-24 — one vocabulary for manual billing status across header,
 * container pills, line badges, timing editor, schedule title pills, Edit Billing
 * dot, and Grand Total Matches MBA.
 *
 * Conceptual state → display word (same string everywhere):
 *   manual timing          → Manual
 *   prepaid (media)        → Media prepaid
 *   prepaid (media + fee)  → Prepaid
 *   fee adjusted           → Fee adjusted
 *   client pays            → Client pays
 *
 * Provenance axis (MB-24) — append · not applied | · unsaved | · saved:
 *   open draft differs from pending/saved        → not applied (draft)
 *   pendingBillingOverrideRows drives display    → unsaved
 *   savedBillingOverrideRows only                → saved
 *   draft/pending contradicts saved for the line → · … · differs from saved
 *   Matches MBA + pending present                → Matches MBA · unsaved
 *
 * Precedence: draft > pending > saved.
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
  /** MB-24 provenance axis — progression: not applied → unsaved → saved */
  draft: "not applied",
  saved: "saved",
  unsaved: "unsaved",
  differsFromSaved: "differs from saved",
  matchesMba: "Matches MBA",
  doesntMatchMba: "Doesn't match MBA",
  savedOverridesDot: "Saved billing overrides",
  unsavedOverridesDot: "Unsaved billing overrides",
  draftOverridesDot: "Not applied billing overrides",
} as const

export type ManualBillingStatusLabel =
  | (typeof MANUAL_BILLING_VOCAB)[keyof typeof MANUAL_BILLING_VOCAB]

/** MB-24: draft (open editor) > unsaved (Applied) > saved (fetched table). */
export type BillingTimingProvenance = "draft" | "unsaved" | "saved"

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

/** Append · not applied | · saved | · unsaved to any MB-9 status word (or header phrase). */
export function withBillingTimingProvenance(
  baseLabel: string,
  provenance: BillingTimingProvenance
): string {
  const suffix =
    provenance === "saved"
      ? MANUAL_BILLING_VOCAB.saved
      : provenance === "draft"
        ? MANUAL_BILLING_VOCAB.draft
        : MANUAL_BILLING_VOCAB.unsaved
  return `${baseLabel} · ${suffix}`
}

/**
 * Full status label for a surface. When draft/pending contradicts saved for the
 * line, appends · differs from saved so the 3 Aug shape cannot be misread as
 * persisted.
 */
export function formatManualBillingStatusLabel(
  kind: ManualBillingStatusKind,
  provenance: BillingTimingProvenance,
  opts?: { differsFromSaved?: boolean }
): string {
  const base = MANUAL_BILLING_VOCAB[kind]
  let label = withBillingTimingProvenance(base, provenance)
  if (
    opts?.differsFromSaved &&
    (provenance === "unsaved" || provenance === "draft")
  ) {
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
  if (provenance === "saved") return MANUAL_BILLING_VOCAB.savedOverridesDot
  if (provenance === "draft") return MANUAL_BILLING_VOCAB.draftOverridesDot
  return MANUAL_BILLING_VOCAB.unsavedOverridesDot
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

function mediaMonthsDifferBetween(
  rowsA: BillingOverrideRow[],
  rowsB: BillingOverrideRow[],
  lineItemId: string
): boolean {
  const a = mediaMonthsForLine(rowsA, lineItemId)
  const b = mediaMonthsForLine(rowsB, lineItemId)
  const months = new Set([...a.map((m) => m.month), ...b.map((m) => m.month)])
  for (const month of months) {
    const av = a.find((m) => m.month === month)?.amount ?? 0
    const bv = b.find((m) => m.month === month)?.amount ?? 0
    if (Math.abs(av - bv) > 0.01) return true
  }
  return false
}

/**
 * Provenance for a line. Precedence: draft > pending (unsaved) > table (saved).
 * Draft only wins when open draft rows contain the line AND differ from the
 * pending/saved baseline (or the line is draft-only). Null when none apply.
 */
export function resolveLineBillingTimingProvenance(
  lineItemId: string,
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[],
  draftRows?: BillingOverrideRow[] | null
): BillingTimingProvenance | null {
  if (draftRows && rowsContainLine(draftRows, lineItemId)) {
    const baseline = rowsContainLine(pendingRows, lineItemId)
      ? pendingRows
      : tableRows
    if (
      !rowsContainLine(baseline, lineItemId) ||
      mediaMonthsDifferBetween(draftRows, baseline, lineItemId)
    ) {
      return "draft"
    }
  }
  if (rowsContainLine(pendingRows, lineItemId)) return "unsaved"
  if (rowsContainLine(tableRows, lineItemId)) return "saved"
  return null
}

/** Campaign-level provenance for title pills / Edit Billing dot / header. */
export function resolveCampaignBillingTimingProvenance(
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[],
  draftRows?: BillingOverrideRow[] | null
): BillingTimingProvenance | null {
  const seen = new Set<string>()
  const consider = (rows: BillingOverrideRow[] | null | undefined) => {
    if (!rows) return
    for (const row of rows) {
      const id = toBillingOverrideLineItemId(rowLineId(row))
      if (!id || seen.has(id)) continue
      seen.add(id)
    }
  }
  consider(draftRows)
  consider(pendingRows)
  consider(tableRows)

  let hasDraft = false
  let hasUnsaved = false
  let hasSaved = false
  for (const id of seen) {
    const p = resolveLineBillingTimingProvenance(
      id,
      pendingRows,
      tableRows,
      draftRows
    )
    if (p === "draft") hasDraft = true
    else if (p === "unsaved") hasUnsaved = true
    else if (p === "saved") hasSaved = true
  }
  if (hasDraft) return "draft"
  if (hasUnsaved) return "unsaved"
  if (hasSaved) return "saved"
  return null
}

/**
 * True when carrier media months for the line differ from saved table months
 * (3 Aug prepaid-on-screen vs auto-in-stores shape).
 */
export function pendingContradictsSavedForLine(
  lineItemId: string,
  pendingRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): boolean {
  if (!rowsContainLine(pendingRows, lineItemId)) return false
  if (!rowsContainLine(tableRows, lineItemId)) return false
  return mediaMonthsDifferBetween(pendingRows, tableRows, lineItemId)
}

/** Draft-displayed months contradict saved table for the line (MB-24 case e). */
export function draftContradictsSavedForLine(
  lineItemId: string,
  draftRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): boolean {
  if (!rowsContainLine(draftRows, lineItemId)) return false
  if (!rowsContainLine(tableRows, lineItemId)) return false
  return mediaMonthsDifferBetween(draftRows, tableRows, lineItemId)
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

/** Any draft line whose media months disagree with the saved table. */
export function draftContradictsSavedAnywhere(
  draftRows: BillingOverrideRow[],
  tableRows: BillingOverrideRow[]
): boolean {
  const seen = new Set<string>()
  for (const row of draftRows) {
    const id = toBillingOverrideLineItemId(rowLineId(row))
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (draftContradictsSavedForLine(id, draftRows, tableRows)) return true
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
  if (provenance === "draft") {
    if (opts?.differsFromSaved) {
      return "Shown timing is not applied and differs from saved billing overrides."
    }
    return "Manual billing timing is edited in the open dialog but not yet Applied."
  }
  if (opts?.differsFromSaved) {
    return "Shown timing is unsaved and differs from saved billing overrides."
  }
  return "Manual billing timing is applied on this page but not yet saved with the plan."
}
