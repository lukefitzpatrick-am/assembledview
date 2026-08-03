/**
 * MB-25 — save-payload override intent (GR-A / GR-B).
 *
 * Load state is three-valued so `[]` is never a sentinel for "I don't know":
 *   unknown — version id unresolved / not yet fetched
 *   loaded  — successful GET (empty array means truly no rows)
 *   failed  — GET threw
 *
 * Tombstone `clearedLineIds` survives refetch so Reset → reopen → save still
 * deletes; Cancel discards the tombstone so the override survives.
 */

import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import {
  toBillingOverrideLineItemId,
} from "@/lib/finance/manualBillingOverridesUi"
import { mergePendingOverSavedOverrideRows } from "@/lib/finance/pendingBillingOverrides"

export type BillingOverridesLoadState = "unknown" | "loaded" | "failed"

export type BillingOverridesSaveEnvelope = {
  /** True only when client load state is `loaded`. */
  authoritative: boolean
  /** Canonical line ids Reset-to-auto has marked for delete at campaign save. */
  clearedLineIds: string[]
}

export const BILLING_OVERRIDES_LOAD_BLOCK_CODE =
  "BILLING_OVERRIDES_LOAD_UNAVAILABLE" as const

export function billingOverridesAuthoritativeFromLoadState(
  loadState: BillingOverridesLoadState
): boolean {
  return loadState === "loaded"
}

/**
 * Block campaign save when the user has Applied pending overrides but the
 * saved table is not trustworthy (failed/unknown). Unknown + no pending may
 * proceed with authoritative:false.
 */
export function shouldBlockSaveForBillingOverridesLoad(args: {
  loadState: BillingOverridesLoadState
  pendingCount: number
}): boolean {
  if (args.pendingCount <= 0) return false
  return args.loadState === "failed" || args.loadState === "unknown"
}

export function buildBillingOverridesSaveEnvelope(args: {
  loadState: BillingOverridesLoadState
  clearedLineIds: Iterable<string>
}): BillingOverridesSaveEnvelope {
  const cleared: string[] = []
  const seen = new Set<string>()
  for (const raw of args.clearedLineIds) {
    const id = toBillingOverrideLineItemId(String(raw ?? ""))
    if (!id || seen.has(id)) continue
    seen.add(id)
    cleared.push(id)
  }
  return {
    authoritative: billingOverridesAuthoritativeFromLoadState(args.loadState),
    clearedLineIds: cleared,
  }
}

function rowCanonId(row: BillingOverrideRow): string {
  return toBillingOverrideLineItemId(
    String(row.line_item_id ?? row.lineItemId ?? "")
  )
}

/** Drop rows whose line id is in the Reset tombstone (canonical). */
export function excludeClearedBillingOverrideRows(
  rows: BillingOverrideRow[],
  clearedLineIds: Iterable<string>
): BillingOverrideRow[] {
  const cleared = new Set<string>()
  for (const raw of clearedLineIds) {
    const id = toBillingOverrideLineItemId(String(raw ?? ""))
    if (id) cleared.add(id)
  }
  if (cleared.size === 0) return rows
  return rows.filter((row) => {
    const id = rowCanonId(row)
    return Boolean(id) && !cleared.has(id)
  })
}

/**
 * Pending ∪ saved for the save attach path, minus Reset tombstones.
 * Cleared lines must not re-enter the payload from a refetch of saved.
 */
export function mergePendingOverSavedExcludingCleared(
  pending: BillingOverrideRow[] | null | undefined,
  saved: BillingOverrideRow[] | null | undefined,
  clearedLineIds: Iterable<string>
): BillingOverrideRow[] {
  const merged = mergePendingOverSavedOverrideRows(pending, saved)
  return excludeClearedBillingOverrideRows(merged, clearedLineIds)
}

/**
 * Add a Reset-to-auto line to the tombstone (canonical). Survives refetch.
 */
export function addClearedBillingOverrideLineId(
  current: Iterable<string>,
  lineItemId: string
): string[] {
  const next = new Set<string>()
  for (const raw of current) {
    const id = toBillingOverrideLineItemId(String(raw ?? ""))
    if (id) next.add(id)
  }
  const add = toBillingOverrideLineItemId(String(lineItemId ?? ""))
  if (add) next.add(add)
  return [...next]
}

/**
 * After Apply: drop tombstone entries for lines that now carry a pending
 * override (user re-asserted timing). Other Reset tombstones remain.
 */
export function pruneClearedBillingOverrideLineIdsAfterApply(
  clearedLineIds: Iterable<string>,
  pendingRows: BillingOverrideRow[]
): string[] {
  const pendingIds = new Set<string>()
  for (const row of pendingRows) {
    const id = rowCanonId(row)
    if (id) pendingIds.add(id)
  }
  const next: string[] = []
  for (const raw of clearedLineIds) {
    const id = toBillingOverrideLineItemId(String(raw ?? ""))
    if (!id || pendingIds.has(id)) continue
    next.push(id)
  }
  return next
}

/**
 * Server gate: only run REPLACE-SET when the client asserts a successful load.
 * Missing envelope → not authoritative (never delete on unknown).
 */
export function shouldReplaceBillingOverridesFromPayload(
  envelope: BillingOverridesSaveEnvelope | null | undefined
): boolean {
  return envelope?.authoritative === true
}
