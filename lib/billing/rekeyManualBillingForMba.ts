/**
 * Create page: manual billing timing is keyed by line id, and a line id is
 * `<MBA number><media code><line number>` (`lineItemIds.ts`). B2a fix (1 Nov
 * 2026) closes two ways applied timing was dropped without a word:
 *
 * - Apply or Prebill while the MBA number is blank, or while a line has only a
 *   placeholder `new-N` id. Those ids never match a saved line, so the save
 *   skipped the timing. {@link manualBillingLineIdBlockReason} blocks that.
 * - The MBA number changing after Apply (the "MBA number taken" retry gives the
 *   plan the next number). The lines re-mint as `<new MBA><code><n>` with the
 *   same code and number (`assignStableLineItemNumbers` keeps each line's
 *   number), so the applied timing is re-keyed by swapping the MBA prefix. Any
 *   id not in that shape makes the re-key refuse (null) so the caller clears
 *   and warns instead of guessing.
 *
 * The partial MBA line selection is keyed the same way: the save's `mbaScope`
 * rebuilds every line's approval from it by exact canonical id
 * (`applyMbaScopeLineApprovals`), so a stale selection would exclude every line.
 */

import type { BillingMonth } from "@/lib/billing/types"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import type { LineOverrideMeta } from "@/lib/finance/manualBillingOverridesUi"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"

const CODES = new Set<string>(Object.values(MEDIA_TYPE_ID_CODES))

const BILLING_PREFIX = /^(billing-[^:]+::)(.+)$/

export const MBA_NUMBER_BLANK_BILLING_MESSAGE =
  "Choose a client first so the plan has an MBA number. Billing timing is keyed to line ids that include the MBA number; without one the timing would not save."

export const PLACEHOLDER_LINE_ID_BILLING_MESSAGE =
  "Some lines do not have a line id yet, so their billing timing would not save. Wait for the media lines to finish loading, reopen Billing and try again."

export function lineIdMbaMismatchBillingMessage(mbaNumber: string): string {
  return `Some lines' ids do not belong to MBA ${mbaNumber}, so their billing timing would not save. Close Billing, reopen it so the lines refresh, then try again.`
}

function splitBillingPrefix(id: string): { prefix: string; bare: string } {
  const s = String(id ?? "").trim()
  const m = BILLING_PREFIX.exec(s)
  return m ? { prefix: m[1]!, bare: m[2]!.trim() } : { prefix: "", bare: s }
}

/** True for the editor's placeholder id (`new-N`, bare or `billing-x::new-N`). */
export function isPlaceholderBillingLineId(id: string): boolean {
  return splitBillingPrefix(id).bare.startsWith("new-")
}

/**
 * True when `bare` is `<mba><media code><n>` exactly as `buildLineItemId`
 * mints it for this MBA number (case-sensitive; the code must be a known one).
 */
export function isLineIdMintedForMba(bare: string, mba: string): boolean {
  if (!mba || !bare.startsWith(mba)) return false
  const m = /^([A-Z]+)(\d+)$/.exec(bare.slice(mba.length))
  return Boolean(m && CODES.has(m[1]!) && Number(m[2]) > 0)
}

/**
 * Why Apply or Prebill must not run yet, or null when it may. `lineIds` are the
 * lines whose timing would be saved (manual media or fee, or the line being
 * prebilled). Every one must be minted for the current MBA number; anything
 * else would not match a save line and the timing would be dropped.
 */
export function manualBillingLineIdBlockReason(
  mbaNumber: string | null | undefined,
  lineIds: readonly string[]
): string | null {
  const mba = String(mbaNumber ?? "").trim()
  if (!mba) return MBA_NUMBER_BLANK_BILLING_MESSAGE
  if (lineIds.some(isPlaceholderBillingLineId)) return PLACEHOLDER_LINE_ID_BILLING_MESSAGE
  if (lineIds.some((id) => !isLineIdMintedForMba(splitBillingPrefix(id).bare, mba))) {
    return lineIdMbaMismatchBillingMessage(mba)
  }
  return null
}

/**
 * Move one line id (bare or `billing-x::` decorated) from `from` to `to`.
 * Already on `to`: unchanged. Placeholder `new-N` and `__service__*` (not
 * MBA-keyed): unchanged. Anything else not shaped `<from><code><n>`: null.
 */
export function rekeyLineIdForMba(id: string, from: string, to: string): string | null {
  const f = String(from ?? "").trim()
  const t = String(to ?? "").trim()
  const { prefix, bare } = splitBillingPrefix(id)
  if (!f || !t) return null
  if (f === t) return String(id ?? "").trim()
  if (bare.startsWith("new-") || bare.startsWith("__service__")) return String(id ?? "").trim()
  if (isLineIdMintedForMba(bare, t)) return `${prefix}${bare}`
  if (!isLineIdMintedForMba(bare, f)) return null
  return `${prefix}${t}${bare.slice(f.length)}`
}

/** Pending override rows. Null when any row's line id cannot be moved. */
export function rekeyOverrideRowsForMba(
  rows: readonly BillingOverrideRow[],
  from: string,
  to: string
): BillingOverrideRow[] | null {
  const out: BillingOverrideRow[] = []
  for (const row of rows) {
    const next: BillingOverrideRow = { ...row }
    for (const key of ["line_item_id", "lineItemId"] as const) {
      const raw = row[key]
      if (raw == null || String(raw).trim() === "") continue
      const moved = rekeyLineIdForMba(String(raw), from, to)
      if (moved == null) return null
      next[key] = moved
    }
    out.push(next)
  }
  return out
}

/** Billing months (draft, applied or auto reference). Returns a copy, or null. */
export function rekeyBillingMonthsForMba(
  months: readonly BillingMonth[],
  from: string,
  to: string
): BillingMonth[] | null {
  const copy = JSON.parse(JSON.stringify(months)) as BillingMonth[]
  for (const month of copy) {
    if (!month.lineItems) continue
    for (const items of Object.values(month.lineItems)) {
      if (!Array.isArray(items)) continue
      for (const line of items) {
        const moved = rekeyLineIdForMba(String(line.id ?? ""), from, to)
        if (moved == null) return null
        line.id = moved
      }
    }
  }
  return copy
}

/** Reason and date-basis meta keyed by line id. Returns a copy, or null. */
export function rekeyLineOverrideMetaForMba(
  meta: ReadonlyMap<string, LineOverrideMeta[]>,
  from: string,
  to: string
): Map<string, LineOverrideMeta[]> | null {
  const out = new Map<string, LineOverrideMeta[]>()
  for (const [key, list] of meta) {
    const moved = rekeyLineIdForMba(key, from, to)
    if (moved == null) return null
    out.set(moved, list.map((m) => ({ ...m })))
  }
  return out
}

/**
 * Save-body line inputs (`billingSaveInputs.lineItems`) built before the MBA
 * number changed. Overrides and approvals ride on the line, so moving the id
 * keeps them on the matching save line. Returns a copy, or null.
 */
export function rekeyLineInputsForMba(
  lines: readonly LineItemInput[],
  from: string,
  to: string
): LineItemInput[] | null {
  const out: LineItemInput[] = []
  for (const line of lines) {
    const moved = rekeyLineIdForMba(line.lineItemId, from, to)
    if (moved == null) return null
    out.push({ ...line, lineItemId: moved })
  }
  return out
}

export type CreateManualBillingState = {
  pendingRows: BillingOverrideRow[]
  draftMonths: BillingMonth[]
  meta: Map<string, LineOverrideMeta[]>
  applied: { months: BillingMonth[]; meta: Map<string, LineOverrideMeta[]> } | null
  autoReferenceMonths: BillingMonth[]
}

/** Every create-page carrier at once: all move, or null (caller clears and warns). */
export function rekeyCreateManualBillingStateForMba(
  state: CreateManualBillingState,
  from: string,
  to: string
): CreateManualBillingState | null {
  const pendingRows = rekeyOverrideRowsForMba(state.pendingRows, from, to)
  const draftMonths = rekeyBillingMonthsForMba(state.draftMonths, from, to)
  const meta = rekeyLineOverrideMetaForMba(state.meta, from, to)
  const autoReferenceMonths = rekeyBillingMonthsForMba(state.autoReferenceMonths, from, to)
  if (!pendingRows || !draftMonths || !meta || !autoReferenceMonths) return null
  let applied: CreateManualBillingState["applied"] = null
  if (state.applied) {
    const months = rekeyBillingMonthsForMba(state.applied.months, from, to)
    const appliedMeta = rekeyLineOverrideMetaForMba(state.applied.meta, from, to)
    if (!months || !appliedMeta) return null
    applied = { months, meta: appliedMeta }
  }
  return { pendingRows, draftMonths, meta, applied, autoReferenceMonths }
}

/** Partial MBA line selection (`partialMBASelectedLineItemIds`). Copy, or null. */
export function rekeyPartialMbaSelectionForMba(
  byMedia: Readonly<Record<string, readonly string[] | undefined>>,
  from: string,
  to: string
): Record<string, string[]> | null {
  const out: Record<string, string[]> = {}
  for (const [media, ids] of Object.entries(byMedia)) {
    const next: string[] = []
    for (const id of ids ?? []) {
      const moved = rekeyLineIdForMba(id, from, to)
      if (moved == null) return null
      next.push(moved)
    }
    out[media] = next
  }
  return out
}

/** Rows keyed by `lineItemId` (MBA scope labels). Copy, or null. */
export function rekeyLineIdRowsForMba<T extends { lineItemId: string }>(
  rows: readonly T[],
  from: string,
  to: string
): T[] | null {
  const out: T[] = []
  for (const row of rows) {
    const moved = rekeyLineIdForMba(row.lineItemId, from, to)
    if (moved == null) return null
    out.push({ ...row, lineItemId: moved })
  }
  return out
}

/** Partial approval metadata: each channel's `selectedLineItemIds`. Copy, or null. */
export function rekeyPartialApprovalChannelsForMba<
  M extends { channels: Array<{ selectedLineItemIds: string[] }> },
>(metadata: M, from: string, to: string): M | null {
  const channels: M["channels"] = []
  for (const channel of metadata.channels) {
    const ids: string[] = []
    for (const id of channel.selectedLineItemIds) {
      const moved = rekeyLineIdForMba(id, from, to)
      if (moved == null) return null
      ids.push(moved)
    }
    channels.push({ ...channel, selectedLineItemIds: ids })
  }
  return { ...metadata, channels }
}
