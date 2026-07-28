/**
 * Plan C S2-P5 — attach reconstructed BillingMonth[] onto version objects
 * for a given read surface. Sync attach for tests; async hydrate for routes.
 */

import type { BillingMonth } from "@/lib/billing/types"
import {
  PLANC_ATTACHED_BILLING_MONTHS,
  PLANC_ATTACHED_DELIVERY_MONTHS,
  PLANC_ATTACHED_ROWS_CHECKSUM,
  shouldReadPlanRows,
  type PlanCReadRowsSurface,
} from "@/lib/finance/rows/readFlags"
import { fetchPlanRowsForVersions } from "@/lib/finance/rows/fetchPlanRows"
import {
  billingMonthsFromPlanBillingRows,
  billingMonthsFromPlanDeliveryRows,
} from "@/lib/finance/rows/schedulesFromRows"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"

export type AttachPlanRowsInput = {
  billingRows?: PlanBillingRow[]
  deliveryRows?: PlanDeliveryRow[]
  /** Prefer stored snapshot_checksum when present (docs surface). */
  snapshotChecksum?: string | null
}

/**
 * Sync: attach reconstructed schedules when surface flag + migrated.
 * Mutates and returns the same version object.
 */
export function attachPlanRowSchedulesSync(
  version: Record<string, unknown>,
  surface: PlanCReadRowsSurface,
  input: AttachPlanRowsInput
): Record<string, unknown> {
  if (!shouldReadPlanRows(surface, version)) return version

  if (input.billingRows && input.billingRows.length > 0) {
    version[PLANC_ATTACHED_BILLING_MONTHS] = billingMonthsFromPlanBillingRows(input.billingRows)
  }
  if (input.deliveryRows && input.deliveryRows.length > 0) {
    version[PLANC_ATTACHED_DELIVERY_MONTHS] = billingMonthsFromPlanDeliveryRows(input.deliveryRows)
  }
  const stored =
    input.snapshotChecksum ??
    (typeof version.snapshot_checksum === "string" ? version.snapshot_checksum : null) ??
    (typeof version.snapshotChecksum === "string" ? version.snapshotChecksum : null)
  if (stored) {
    version[PLANC_ATTACHED_ROWS_CHECKSUM] = stored
  }
  return version
}

export function getAttachedBillingMonths(
  version: Record<string, unknown>
): BillingMonth[] | undefined {
  const v = version[PLANC_ATTACHED_BILLING_MONTHS]
  return Array.isArray(v) ? (v as BillingMonth[]) : undefined
}

export function getAttachedDeliveryMonths(
  version: Record<string, unknown>
): BillingMonth[] | undefined {
  const v = version[PLANC_ATTACHED_DELIVERY_MONTHS]
  return Array.isArray(v) ? (v as BillingMonth[]) : undefined
}

export function getAttachedRowsChecksum(version: Record<string, unknown>): string | undefined {
  const v = version[PLANC_ATTACHED_ROWS_CHECKSUM]
  return typeof v === "string" && v.length > 0 ? v : undefined
}

/**
 * Async hydrate: fetch rows for migrated versions when surface flag is on,
 * then attach reconstructed schedules. Versions without migration are untouched
 * (blob fallback). Soft-fail fetch leaves blobs in place.
 */
export async function attachPlanRowSchedulesForSurface(
  versions: Record<string, unknown>[],
  surface: PlanCReadRowsSurface,
  opts?: { baseUrl?: string }
): Promise<Record<string, unknown>[]> {
  const candidates = versions.filter((v) => shouldReadPlanRows(surface, v))
  if (candidates.length === 0) return versions

  const ids = candidates
    .map((v) => v.id)
    .filter((id): id is string | number => id != null && String(id).trim() !== "")

  if (ids.length === 0) return versions

  const byId = await fetchPlanRowsForVersions(ids, opts)

  for (const version of candidates) {
    const id = version.id
    if (id == null) continue
    const rows = byId.get(String(id))
    if (!rows) continue
    const hasBilling = rows.billingRows.length > 0
    const hasDelivery = rows.deliveryRows.length > 0
    // Empty fetch (missing tables) → keep blob fallback
    if (!hasBilling && !hasDelivery) continue
    attachPlanRowSchedulesSync(version, surface, {
      billingRows: hasBilling ? rows.billingRows : undefined,
      deliveryRows: hasDelivery ? rows.deliveryRows : undefined,
    })
  }

  return versions
}

/**
 * Resolve delivery schedule payload for pacing: attached months when present,
 * else the raw blob (instant fallback).
 */
export function resolveDeliveryScheduleForPacing(
  version: Record<string, unknown>,
  blobDelivery: unknown
): unknown {
  const attached = getAttachedDeliveryMonths(version)
  if (attached && attached.length > 0) return attached
  return blobDelivery
}
