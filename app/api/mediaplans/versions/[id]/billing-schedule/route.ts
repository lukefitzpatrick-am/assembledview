import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { readBillingOverridesForVersion } from "@/lib/data/readFinance"
import {
  BillingScheduleWriteError,
  patchBillingScheduleOnPostgres,
} from "@/lib/data/writeBillingSchedule"
import type { BillingOverrideRow } from "@/lib/finance/billingOverrides"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { clearRelevantPlanVersionsCache } from "@/lib/finance/relevantPlanVersions"
import { recomputeAndValidateBillingScheduleOnSave } from "@/lib/finance/recomputeBillingScheduleOnSave"
import { diffBillingSchedules } from "@/lib/finance/scheduleDiff"
import { writeScheduleDiffEdits } from "@/lib/finance/writeFinanceAuditEdits"
import { requireFinanceAdmin } from "@/lib/requireRole"

/**
 * PATCH /api/mediaplans/versions/[id]/billing-schedule
 * Postgres legacy_schedules + billing schedule_months (X3).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: "Missing version id" }, { status: 400 })
    }
    const versionId = Number(id)
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ error: "Invalid version id" }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      )
    }

    const db = getDb()
    const versionRows = await db
      .select()
      .from(schema.mediaPlanVersions)
      .where(eq(schema.mediaPlanVersions.id, versionId))
      .limit(1)
    const versionPg = versionRows[0]
    if (!versionPg) {
      return NextResponse.json({ error: "Media plan version not found" }, { status: 404 })
    }

    const legacy =
      versionPg.legacySchedules && typeof versionPg.legacySchedules === "object"
        ? (versionPg.legacySchedules as Record<string, unknown>)
        : {}
    const oldSchedule = legacy.billingSchedule ?? null
    const versionRow: Record<string, unknown> = {
      id: versionPg.id,
      mba_number: versionPg.mbaNumber,
      campaign_start_date: versionPg.campaignStartDate,
      campaign_end_date: versionPg.campaignEndDate,
      billingSchedule: legacy.billingSchedule ?? null,
      deliverySchedule: legacy.deliverySchedule ?? null,
    }

    const bodyRecord = body as Record<string, unknown>
    const clientSentSchedule = Object.prototype.hasOwnProperty.call(
      bodyRecord,
      "billingSchedule"
    )
    const clientBillingSchedule = clientSentSchedule
      ? bodyRecord.billingSchedule
      : undefined

    if (!clientSentSchedule) {
      const hasLineItems =
        Array.isArray(bodyRecord.lineItems) || Array.isArray(bodyRecord.financialLineItems)
      if (!hasLineItems) {
        return NextResponse.json(
          { error: "Request body must include billingSchedule (or lineItems to regenerate)" },
          { status: 400 }
        )
      }
    }

    let scheduleToPersist: unknown = clientBillingSchedule
    let deliveryToPersist: unknown | undefined
    let inputsHash: string | undefined

    const financialLineItems = (Array.isArray(bodyRecord.lineItems)
      ? bodyRecord.lineItems
      : Array.isArray(bodyRecord.financialLineItems)
        ? bodyRecord.financialLineItems
        : null) as LineItemInput[] | null
    const feeLoading = (bodyRecord.feeLoading ??
      bodyRecord.fee_loading ??
      null) as FeeLoading | null

    if (financialLineItems && financialLineItems.length > 0 && feeLoading) {
      const overrideRows = (await readBillingOverridesForVersion(
        versionId
      )) as BillingOverrideRow[]
      const startRaw = versionRow.campaign_start_date
      const endRaw = versionRow.campaign_end_date
      const recompute = recomputeAndValidateBillingScheduleOnSave({
        lineItems: financialLineItems,
        feeLoading,
        clientBillingSchedule: clientSentSchedule ? clientBillingSchedule : null,
        overrideRows,
        opts: {
          ...(startRaw ? { campaignStart: new Date(String(startRaw)) } : {}),
          ...(endRaw ? { campaignEnd: new Date(String(endRaw)) } : {}),
        },
      })
      if (!recompute.ok) {
        return NextResponse.json(recompute.body, { status: recompute.status })
      }
      scheduleToPersist = recompute.billingSchedule
      inputsHash = recompute.inputs_hash
      if (recompute.generatedFromServer) {
        deliveryToPersist = recompute.deliverySchedule
      }
    } else if (scheduleToPersist == null) {
      return NextResponse.json(
        {
          error:
            "billingSchedule cannot be null — omit with lineItems to regenerate, or send a schedule",
        },
        { status: 400 }
      )
    }

    const patched = await patchBillingScheduleOnPostgres({
      versionId,
      billingSchedule: scheduleToPersist,
      ...(deliveryToPersist != null ? { deliverySchedule: deliveryToPersist } : {}),
      inputsHash: inputsHash ?? null,
    })

    clearRelevantPlanVersionsCache()

    try {
      const user = await getCurrentUser(request)
      const changes = diffBillingSchedules(oldSchedule, scheduleToPersist)
      if (user && changes.length > 0) {
        const audit = await writeScheduleDiffEdits(changes, {
          editedBy: user.id,
          editedByName: user.name ?? user.email ?? String(user.id),
          recordType: "schedule_patch",
        })
        if (audit.succeeded < audit.attempted) {
          console.warn("[billing-schedule-patch] partial audit failure", audit)
        }
      } else if (!user) {
        console.error("[billing-schedule-patch] no user resolved; skipping audit")
      }
    } catch (auditError) {
      console.error("[billing-schedule-patch] audit step threw", {
        message: auditError instanceof Error ? auditError.message : String(auditError),
      })
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: patched.versionId,
        mba_number: patched.mbaNumber,
        billingSchedule: patched.legacySchedules.billingSchedule,
        deliverySchedule: patched.legacySchedules.deliverySchedule,
      },
      ...(inputsHash ? { inputs_hash: inputsHash, rebill_needed: false } : {}),
    })
  } catch (error) {
    if (error instanceof BillingScheduleWriteError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "VERSION_PUBLISHED_IMMUTABLE"
            ? 409
            : 400
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status }
      )
    }
    console.error("[api/mediaplans/versions/billing-schedule PATCH]", error)
    return NextResponse.json({ error: "Failed to patch billing schedule" }, { status: 500 })
  }
}
