import "server-only"

import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"

export type MbaLineApprovalApiRow = {
  id?: number
  created_at?: string | number | null
  mba_number: string
  media_plan_version: number
  line_item_id: string
  media_type: string
  approved: boolean
  approved_in_version?: number | null
}

export type ReadMbaLineApprovalsResult =
  | { ok: true; lines: MbaLineApprovalApiRow[]; available: true }
  /** Upstream 404 / feature not provisioned — genuine empty approvals surface. */
  | { ok: true; lines: []; available: false }
  /** Transport / DB failure — never disguise as empty approvals. */
  | { ok: false; lines: []; available: false; error: string }

export function mapApprovalRowFromPostgres(
  row: Record<string, unknown>
): MbaLineApprovalApiRow {
  const shaped = coerceNumericStringsToNumbers(toApiRow(row))
  return {
    id: shaped.id != null ? Number(shaped.id) : undefined,
    created_at: (shaped.created_at as string | null | undefined) ?? null,
    mba_number: String(shaped.mba_number ?? ""),
    media_plan_version: Number(shaped.media_plan_version ?? 0),
    line_item_id: String(shaped.line_item_id ?? ""),
    media_type: String(shaped.media_type ?? ""),
    approved: shaped.approved === true || shaped.approved === "true",
    approved_in_version:
      shaped.approved_in_version == null || shaped.approved_in_version === ""
        ? null
        : Number(shaped.approved_in_version),
  }
}

export async function fetchMbaLineApprovalsFromPostgres(
  mbaNumber: string,
  mediaPlanVersion: number
): Promise<MbaLineApprovalApiRow[]> {
  const db = getDb()
  const rows = await db
    .select()
    .from(schema.mbaLineApprovals)
    .where(
      and(
        eq(schema.mbaLineApprovals.mbaNumber, mbaNumber),
        eq(schema.mbaLineApprovals.mediaPlanVersion, mediaPlanVersion)
      )
    )
  return rows.map((row) =>
    mapApprovalRowFromPostgres(row as Record<string, unknown>)
  )
}

/**
 * MBA line approvals for one (mba, version). Postgres.
 * Absence of rows ⇒ all approved (caller / mbaLineApprovalsClient contract).
 * Hard failures → ok:false.
 */
export async function readMbaLineApprovals(
  mbaNumber: string,
  mediaPlanVersion: number
): Promise<ReadMbaLineApprovalsResult> {
  try {
    const lines = await fetchMbaLineApprovalsFromPostgres(
      mbaNumber,
      mediaPlanVersion
    )
    return { ok: true, lines, available: true }
  } catch (err) {
    console.error("[readMbaLineApprovals]", err)
    return {
      ok: false,
      lines: [],
      available: false,
      error: "Failed to load mba_line_approvals",
    }
  }
}
