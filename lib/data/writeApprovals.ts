import { and, eq } from "drizzle-orm"
import { getDb, schema } from "@/db"

export type MbaLineApprovalPatchLine = {
  line_item_id: string
  media_type: string
  approved: boolean
}

export type WriteMbaLineApprovalsResult =
  | { ok: true; available: true; data?: unknown }
  | { ok: false; available: false; status: number; error: string; upstream?: unknown }

/**
 * Bulk approve/exclude — mirrors Xano X5.1 PATCH semantics:
 *   approved:true  → delete row (absence = all-in)
 *   approved:false → upsert exclusion (approved=false, approved_in_version=null)
 */
export async function patchMbaLineApprovalsOnPostgres(params: {
  mbaNumber: string
  mediaPlanVersion: number
  lines: MbaLineApprovalPatchLine[]
}): Promise<{ ok: true; results: Array<Record<string, unknown>> }> {
  const db = getDb()
  const results: Array<Record<string, unknown>> = []

  for (const line of params.lines) {
    const lineItemId = String(line.line_item_id ?? "").trim()
    const mediaType = String(line.media_type ?? "").trim()
    const approved = line.approved === true

    const existing = await db
      .select({ id: schema.mbaLineApprovals.id })
      .from(schema.mbaLineApprovals)
      .where(
        and(
          eq(schema.mbaLineApprovals.mbaNumber, params.mbaNumber),
          eq(schema.mbaLineApprovals.mediaPlanVersion, params.mediaPlanVersion),
          eq(schema.mbaLineApprovals.lineItemId, lineItemId),
          eq(schema.mbaLineApprovals.mediaType, mediaType)
        )
      )
      .limit(1)

    if (approved) {
      if (existing[0]) {
        await db
          .delete(schema.mbaLineApprovals)
          .where(eq(schema.mbaLineApprovals.id, existing[0].id))
      }
      results.push({
        line_item_id: lineItemId,
        action: "approved_absent",
        approved: true,
      })
      continue
    }

    if (existing[0]) {
      await db
        .update(schema.mbaLineApprovals)
        .set({
          mediaType,
          approved: false,
          approvedInVersion: null,
        })
        .where(eq(schema.mbaLineApprovals.id, existing[0].id))
    } else {
      await db.insert(schema.mbaLineApprovals).values({
        mbaNumber: params.mbaNumber,
        mediaPlanVersion: params.mediaPlanVersion,
        lineItemId,
        mediaType,
        approved: false,
        approvedInVersion: null,
      })
    }
    results.push({
      line_item_id: lineItemId,
      action: "excluded",
      approved: false,
    })
  }

  return {
    ok: true,
    results,
  }
}

/** MBA line approval writes. Postgres. */
export async function writeMbaLineApprovals(params: {
  mbaNumber: string
  mediaPlanVersion: number
  lines: MbaLineApprovalPatchLine[]
}): Promise<WriteMbaLineApprovalsResult> {
  try {
    const result = await patchMbaLineApprovalsOnPostgres(params)
    return {
      ok: true,
      available: true,
      data: {
        mba_number: params.mbaNumber,
        media_plan_version: params.mediaPlanVersion,
        results: result.results,
      },
    }
  } catch (err) {
    console.error("[writeMbaLineApprovals]", err)
    return {
      ok: false,
      available: false,
      status: 500,
      error: "Failed to patch mba_line_approvals",
    }
  }
}
