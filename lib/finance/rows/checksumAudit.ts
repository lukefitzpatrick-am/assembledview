/**
 * Plan C S2-P6 — rows checksum tripwire (pure helpers).
 *
 * - checksum_drift: recomputed rows hash ≠ stored snapshot_checksum (migrated current versions)
 * - writer_bypass: plan_*_rows exist for a version with billing_rows_migrated=false
 *
 * Runs weekly (Monday UTC) inside `/api/cron/billing-integrity`, or on demand via
 * `?rows_checksum=1`. Soft-fails when plan_* tables are missing.
 */

import type { IntegrityFinding, IntegritySeverity } from "@/lib/billing/integrityTripwire"
import { checksumForPlanRows } from "@/lib/finance/rows/dualWrite"
import { isBillingRowsMigrated } from "@/lib/finance/rows/readFlags"
import type { PlanBillingRow, PlanDeliveryRow } from "@/lib/finance/rows/types"
import { roundMoney2 } from "@/lib/format/money"

export type RowsChecksumVersionMeta = {
  id: number
  mba_number: string
  version_number: number
  /** Master's current version_number for this MBA — used for live vs history. */
  isCurrent: boolean
  billing_rows_migrated: boolean
  snapshot_checksum: string | null
}

/** True on Monday UTC, or when force=true (manual `?rows_checksum=1`). */
export function shouldRunRowsChecksumAudit(args?: {
  now?: Date
  force?: boolean
}): boolean {
  if (args?.force) return true
  const d = args?.now ?? new Date()
  return d.getUTCDay() === 1
}

function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1"
}

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Strip Xano extras (id, created_at) and normalise money for stable hashing. */
export function canonicalizeBillingRow(raw: Record<string, unknown>): PlanBillingRow {
  return {
    media_plan_version: asNum(raw.media_plan_version),
    mba_number: String(raw.mba_number ?? "").trim(),
    line_uid: String(raw.line_uid ?? "").trim(),
    line_source: String(raw.line_source ?? "channel") as PlanBillingRow["line_source"],
    media_type: String(raw.media_type ?? "").trim(),
    month: String(raw.month ?? "").trim(),
    media_amount: roundMoney2(asNum(raw.media_amount)),
    fee_amount: roundMoney2(asNum(raw.fee_amount)),
    adserving_amount: roundMoney2(asNum(raw.adserving_amount)),
    billable_amount: roundMoney2(asNum(raw.billable_amount)),
    client_pays_for_media: asBool(raw.client_pays_for_media),
    is_manual_override: asBool(raw.is_manual_override),
    source: String(raw.source ?? "auto") as PlanBillingRow["source"],
    override_id:
      raw.override_id == null || raw.override_id === ""
        ? null
        : asNum(raw.override_id),
  }
}

export function canonicalizeDeliveryRow(raw: Record<string, unknown>): PlanDeliveryRow {
  return {
    media_plan_version: asNum(raw.media_plan_version),
    mba_number: String(raw.mba_number ?? "").trim(),
    line_uid: String(raw.line_uid ?? "").trim(),
    line_source: String(raw.line_source ?? "channel") as PlanDeliveryRow["line_source"],
    media_type: String(raw.media_type ?? "").trim(),
    month: String(raw.month ?? "").trim(),
    delivery_amount: roundMoney2(asNum(raw.delivery_amount)),
    media_amount_full: roundMoney2(asNum(raw.media_amount_full)),
  }
}

function rowSortKey(r: { line_uid: string; month: string; media_type: string }): string {
  return `${r.line_uid}\u0000${r.month}\u0000${r.media_type}`
}

export function sortBillingRowsForChecksum(rows: PlanBillingRow[]): PlanBillingRow[] {
  return [...rows].sort((a, b) => rowSortKey(a).localeCompare(rowSortKey(b)))
}

export function sortDeliveryRowsForChecksum(rows: PlanDeliveryRow[]): PlanDeliveryRow[] {
  return [...rows].sort((a, b) => rowSortKey(a).localeCompare(rowSortKey(b)))
}

export function recomputeRowsChecksum(args: {
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
}): string {
  return checksumForPlanRows({
    billingRows: sortBillingRowsForChecksum(args.billingRows),
    deliveryRows: sortDeliveryRowsForChecksum(args.deliveryRows),
  })
}

function severityFor(meta: RowsChecksumVersionMeta): IntegritySeverity {
  return meta.isCurrent ? "live" : "history"
}

/**
 * Migrated current version: recompute checksum from rows vs stored snapshot_checksum.
 * Missing stored checksum with non-empty rows also counts as drift.
 */
export function flagChecksumDrift(args: {
  meta: RowsChecksumVersionMeta
  billingRows: PlanBillingRow[]
  deliveryRows: PlanDeliveryRow[]
}): IntegrityFinding | null {
  const { meta, billingRows, deliveryRows } = args
  if (!meta.billing_rows_migrated) return null
  if (!meta.isCurrent) return null

  const billingCount = billingRows.length
  const deliveryCount = deliveryRows.length
  if (billingCount === 0 && deliveryCount === 0) {
    // Migrated but empty — only drift if a checksum was stamped expecting rows
    if (!meta.snapshot_checksum) return null
  }

  const recomputed = recomputeRowsChecksum({ billingRows, deliveryRows })
  const stored = meta.snapshot_checksum
  if (stored && stored === recomputed) return null

  return {
    table: "plan_billing_rows+plan_delivery_rows",
    mba_number: meta.mba_number,
    version: meta.id,
    rows: billingCount + deliveryCount,
    distinctIds: 0,
    kind: "checksum_drift",
    severity: severityFor(meta),
    storedChecksum: stored,
    recomputedChecksum: recomputed,
  }
}

/**
 * Rows present while billing_rows_migrated=false → writer bypassed the migration gate
 * (or dual-write ran without stamping migrated).
 */
export function flagWriterBypass(args: {
  meta: RowsChecksumVersionMeta
  billingRowCount: number
  deliveryRowCount: number
}): IntegrityFinding | null {
  const { meta, billingRowCount, deliveryRowCount } = args
  if (meta.billing_rows_migrated) return null
  const total = billingRowCount + deliveryRowCount
  if (total <= 0) return null

  return {
    table: "plan_billing_rows+plan_delivery_rows",
    mba_number: meta.mba_number,
    version: meta.id,
    rows: total,
    distinctIds: 0,
    kind: "writer_bypass",
    severity: severityFor(meta),
  }
}

export function versionMetaFromRaw(
  raw: Record<string, unknown>,
  currentVersionByMba: ReadonlyMap<string, number>
): RowsChecksumVersionMeta | null {
  const id = Number(raw.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const mba = String(raw.mba_number ?? "").trim()
  const version_number = Number(raw.version_number)
  if (!Number.isFinite(version_number)) return null
  const current = currentVersionByMba.get(mba)
  const snapshot =
    typeof raw.snapshot_checksum === "string" && raw.snapshot_checksum.length > 0
      ? raw.snapshot_checksum
      : typeof raw.snapshotChecksum === "string" && raw.snapshotChecksum.length > 0
        ? raw.snapshotChecksum
        : null
  return {
    id,
    mba_number: mba,
    version_number,
    isCurrent: current != null && version_number === current,
    billing_rows_migrated: isBillingRowsMigrated(raw),
    snapshot_checksum: snapshot,
  }
}

/**
 * Build all rows-audit findings for a set of versions + their row counts/payloads.
 * Pure — network fetch lives in the cron route.
 */
export function flagRowsChecksumFindings(args: {
  versions: RowsChecksumVersionMeta[]
  /** versionId → canonical billing rows */
  billingByVersion: ReadonlyMap<number, PlanBillingRow[]>
  /** versionId → canonical delivery rows */
  deliveryByVersion: ReadonlyMap<number, PlanDeliveryRow[]>
}): IntegrityFinding[] {
  const out: IntegrityFinding[] = []
  for (const meta of args.versions) {
    const billing = args.billingByVersion.get(meta.id) ?? []
    const delivery = args.deliveryByVersion.get(meta.id) ?? []

    const bypass = flagWriterBypass({
      meta,
      billingRowCount: billing.length,
      deliveryRowCount: delivery.length,
    })
    if (bypass) out.push(bypass)

    const drift = flagChecksumDrift({
      meta,
      billingRows: billing,
      deliveryRows: delivery,
    })
    if (drift) out.push(drift)
  }
  return out
}
