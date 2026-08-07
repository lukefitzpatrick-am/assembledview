import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { getDb, schema } from "@/db"
import {
  FINANCE_EDITS_PATH,
  xanoFinancePost,
} from "@/lib/finance/xanoFinanceApi"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const bodySchema = z.object({
  versionId: z.number().int().positive(),
  fees: z.record(z.string(), z.unknown()),
  reason: z.string().min(3),
})

/**
 * POST /api/admin/fee-snapshots/resnapshot — explicit admin overwrite of
 * mba_fee_snapshots (write-once publish path). Reason required; audited to
 * finance_edits.
 *
 * VC Stage 2a: deliberately unguarded — this is the admin checksum/fee repair
 * hatch for published versions (Audit §5.3 write-once override). Applying
 * assertVersionMutable here would make fee-snapshot repair impossible at 3am.
 * Does not mutate line_items / schedule_months / approved_slice.
 */
export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { versionId, fees, reason } = parsed.data
  const db = getDb()

  const [version] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
    })
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.id, versionId))
    .limit(1)

  if (!version) {
    return NextResponse.json(
      { error: `version_id ${versionId} not found`, code: "VERSION_NOT_FOUND" },
      { status: 404 }
    )
  }

  const [existing] = await db
    .select({
      id: schema.mbaFeeSnapshots.id,
      fees: schema.mbaFeeSnapshots.fees,
    })
    .from(schema.mbaFeeSnapshots)
    .where(eq(schema.mbaFeeSnapshots.versionId, versionId))
    .limit(1)

  await db
    .insert(schema.mbaFeeSnapshots)
    .values({ versionId, fees })
    .onConflictDoUpdate({
      target: schema.mbaFeeSnapshots.versionId,
      set: {
        fees,
        capturedAt: sql`now()`,
      },
    })

  const actorUser = gate.session?.user as { email?: string; name?: string } | undefined
  const actor = actorUser?.email ?? actorUser?.name ?? "finance-admin"

  try {
    await xanoFinancePost(FINANCE_EDITS_PATH, {
      entity_type: "mba_fee_snapshots",
      entity_id: String(versionId),
      action: "resnapshot_fees",
      reason,
      mba_number: version.mbaNumber,
      version_number: version.versionNumber,
      before: existing?.fees ?? null,
      after: fees,
      actor,
    })
  } catch (err) {
    console.error("[fee-snapshots/resnapshot] finance_edits audit failed", err)
    // Snapshot write already committed — surface audit failure but keep 200 with warning.
    return NextResponse.json({
      ok: true,
      versionId,
      audit: "failed",
      details: err instanceof Error ? err.message : String(err),
    })
  }

  return NextResponse.json({ ok: true, versionId, audit: "ok" })
}
