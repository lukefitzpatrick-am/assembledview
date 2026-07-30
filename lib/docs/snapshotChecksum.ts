/**
 * PC3 — snapshot checksum for document render + tripwire.
 *
 * hash = sha256(canonical JSON of schedule_months + approved_slice + fee snapshot).
 * Footer uses hash8 = first 8 hex chars. Same input ⇒ same hash ⇒ byte-identical PDF.
 */

import { createHash } from "node:crypto"

import type { ApprovedSlice } from "@/lib/finance/approvedSlice"

export type ChecksumScheduleRow = {
  lineItemId: string
  component: string
  basis: string
  /** YYYY-MM-01 */
  month: string
  amountCents: number
  source: string
}

export type SnapshotChecksumInput = {
  scheduleMonths: ChecksumScheduleRow[]
  approvedSlice: ApprovedSlice | null | undefined
  feeSnapshot: unknown
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function canonicalScheduleRows(rows: ChecksumScheduleRow[]) {
  return [...rows]
    .map((r) => ({
      lineItemId: String(r.lineItemId ?? ""),
      component: String(r.component ?? ""),
      basis: String(r.basis ?? ""),
      month: String(r.month ?? "").slice(0, 10),
      amountCents: Number(r.amountCents) || 0,
      source: String(r.source ?? "computed"),
    }))
    .sort((a, b) => {
      const ka = `${a.basis}|${a.lineItemId}|${a.component}|${a.month}`
      const kb = `${b.basis}|${b.lineItemId}|${b.component}|${b.month}`
      return ka.localeCompare(kb)
    })
}

/** Stable JSON string used as sha256 input. */
export function canonicalSnapshotPayload(input: SnapshotChecksumInput): string {
  const payload = {
    schedule_months: canonicalScheduleRows(input.scheduleMonths),
    approved_slice: input.approvedSlice ?? null,
    fee_snapshot: input.feeSnapshot ?? null,
  }
  return JSON.stringify(sortKeysDeep(payload))
}

export function computeSnapshotChecksum(input: SnapshotChecksumInput): string {
  return createHash("sha256").update(canonicalSnapshotPayload(input), "utf8").digest("hex")
}

export function snapshotHash8(checksumHex: string): string {
  return String(checksumHex ?? "").trim().toLowerCase().slice(0, 8)
}

/** Footer label: `v{n} · {hash8}` */
export function snapshotChecksumFooter(versionNumber: number | string, checksumHex: string): string {
  const n = String(versionNumber ?? "").trim() || "?"
  const h = snapshotHash8(checksumHex) || "--------"
  return `v${n} · ${h}`
}
