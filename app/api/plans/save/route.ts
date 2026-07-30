import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { LINE_CHANNELS } from "@/db/schema"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getWriteBackend } from "@/lib/data/backend"
import {
  mirrorInputFromSave,
  mirrorPlanToXano,
} from "@/lib/data/mirrorToXano"
import { SavePlanError, savePlanVersion } from "@/lib/data/savePlan"
import { requireRole } from "@/lib/requireRole"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const monthAmountSchema = z.object({
  month: z.string().min(1),
  amount: z.number(),
})

const overrideSchema = z.object({
  mode: z.enum(["auto", "manual"]),
  reason: z.enum(["prepayment", "client_terms", "manual"]).optional(),
  months: z.array(monthAmountSchema),
  dateBasis: z.string(),
})

const feeOverrideSchema = z.object({
  mode: z.literal("manual"),
  reason: z.enum(["prepayment", "client_terms", "manual"]).optional(),
  months: z.array(monthAmountSchema),
  dateBasis: z.string(),
  component: z.literal("fee").optional(),
})

const lineItemSchema = z.object({
  lineItemId: z.string().min(1),
  channel: z.enum(LINE_CHANNELS as unknown as [string, ...string[]]),
  position: z.number().int().nullable().optional(),
  market: z.string().nullable().optional(),
  buyingDemo: z.string().nullable().optional(),
  buyType: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  bidStrategy: z.string().nullable().optional(),
  fixedCostMedia: z.boolean().nullable().optional(),
  clientPaysForMedia: z.boolean().nullable().optional(),
  budgetIncludesFees: z.boolean().nullable().optional(),
  noAdserving: z.boolean().nullable().optional(),
  bursts: z.unknown(),
  attrs: z.record(z.string(), z.unknown()).nullable().optional(),
  mediaType: z.string().min(1),
  rate: z.number(),
  enteredAmount: z.number(),
  feePct: z.number().optional(),
  approval: z.enum(["approved", "excluded"]).optional(),
  label: z.string().optional(),
  billingOverride: overrideSchema.optional(),
  feeOverride: feeOverrideSchema.optional(),
})

const ensureMasterSchema = z.object({
  mbaNumber: z.string().min(1),
  mpClientName: z.string().nullable().optional(),
  campaignName: z.string().nullable().optional(),
  campaignStatus: z.string().nullable().optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  campaignBudgetCents: z.number().int().nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
})

const bodySchema = z.object({
  masterId: z.number().int().positive(),
  mbaNumber: z.string().min(1),
  versionNumber: z.number().int().positive(),
  mode: z.enum(["draft", "new_version", "publish"]),
  campaignName: z.string().nullable().optional(),
  campaignStatus: z.string().nullable().optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignEndDate: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  clientContact: z.string().nullable().optional(),
  poNumber: z.string().nullable().optional(),
  campaignBudgetCents: z.number().int().nullable().optional(),
  fixedFee: z.boolean().nullable().optional(),
  channelFlags: z.record(z.string(), z.unknown()).nullable().optional(),
  mediaPlanFile: z.unknown().optional(),
  mbaPdfFile: z.unknown().optional(),
  aaMediaPlanFile: z.unknown().optional(),
  lineItems: z.array(lineItemSchema),
  feeLoading: z.record(z.string(), z.number()),
  feeSnapshot: z.record(z.string(), z.unknown()).optional(),
  adservaudio: z.number().optional(),
  /** Month chips at approve/publish — drives approved_slice. */
  selectedMonthYears: z.array(z.string()).optional(),
  /** Create-path: insert PG master with Xano-aligned id when missing. */
  ensureMaster: ensureMasterSchema.optional(),
})

/**
 * POST /api/plans/save — Postgres transactional save (T4a) + best-effort Xano
 * mirror (T4b). Inactive for users while WRITE_BACKEND=xano (default).
 * Page wiring is T4c. Mirror failure never rolls back Postgres.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  if (getWriteBackend() !== "postgres") {
    return NextResponse.json(
      {
        error: "Postgres plan writes are disabled (WRITE_BACKEND=xano)",
        code: "WRITE_BACKEND_XANO",
      },
      { status: 501 }
    )
  }

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

  const body = parsed.data
  const access = await checkClientMbaAccess(request, body.mbaNumber)
  if (!access.ok) return access.response

  // Create-path: dual-write PG master with the Xano-aligned id before savePlanVersion.
  if (body.ensureMaster) {
    const db = getDb()
    const [existing] = await db
      .select({ id: schema.mediaPlanMasters.id })
      .from(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, body.masterId))
      .limit(1)
    if (!existing) {
      try {
        await db.insert(schema.mediaPlanMasters).values({
          id: body.masterId,
          mbaNumber: body.ensureMaster.mbaNumber,
          mpClientName: body.ensureMaster.mpClientName ?? null,
          campaignName: body.ensureMaster.campaignName ?? null,
          campaignStatus: body.ensureMaster.campaignStatus ?? null,
          campaignStartDate: body.ensureMaster.campaignStartDate ?? null,
          campaignEndDate: body.ensureMaster.campaignEndDate ?? null,
          campaignBudgetCents: body.ensureMaster.campaignBudgetCents ?? null,
          clientId: body.ensureMaster.clientId ?? null,
        })
      } catch (err) {
        console.error("[plans/save] ensureMaster insert failed", err)
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Failed to insert media_plan_masters for create-path save",
            code: "ENSURE_MASTER_FAILED",
          },
          { status: 500 }
        )
      }
    }
  }

  const saveInput = {
    masterId: body.masterId,
    mbaNumber: body.mbaNumber,
    versionNumber: body.versionNumber,
    mode: body.mode,
    campaignName: body.campaignName,
    campaignStatus: body.campaignStatus,
    campaignStartDate: body.campaignStartDate,
    campaignEndDate: body.campaignEndDate,
    brand: body.brand,
    clientContact: body.clientContact,
    poNumber: body.poNumber,
    campaignBudgetCents: body.campaignBudgetCents,
    fixedFee: body.fixedFee,
    channelFlags: body.channelFlags,
    mediaPlanFile: body.mediaPlanFile,
    mbaPdfFile: body.mbaPdfFile,
    aaMediaPlanFile: body.aaMediaPlanFile,
    feeLoading: body.feeLoading,
    feeSnapshot: body.feeSnapshot,
    adservaudio: body.adservaudio,
    selectedMonthYears: body.selectedMonthYears,
    lineItems: body.lineItems.map((l) => ({
      ...l,
      channel: l.channel as (typeof LINE_CHANNELS)[number],
      bursts: l.bursts ?? [],
    })),
  }

  try {
    const result = await savePlanVersion(saveInput)

    // T4b — best-effort Xano mirror AFTER Postgres commit. Never throws.
    let clientName = body.mbaNumber
    try {
      const db = getDb()
      const [master] = await db
        .select({ mpClientName: schema.mediaPlanMasters.mpClientName })
        .from(schema.mediaPlanMasters)
        .where(eq(schema.mediaPlanMasters.id, body.masterId))
        .limit(1)
      if (master?.mpClientName?.trim()) clientName = master.mpClientName.trim()
    } catch {
      // fall through with mba as client name
    }

    const mirror = await mirrorPlanToXano(
      mirrorInputFromSave(saveInput, result.versionId, clientName)
    )

    return NextResponse.json({
      versionId: result.versionId,
      lineCount: result.lineCount,
      scheduleRowCount: result.scheduleRowCount,
      published: result.published,
      mirror: mirror.mirror,
      mirrorDurationMs: mirror.durationMs,
      ...(mirror.mirror === "failed" ? { mirrorError: mirror.error } : {}),
    })
  } catch (err) {
    if (err instanceof SavePlanError) {
      const status =
        err.code === "BOSS006_EMPTY_PUBLISH" || err.code === "C1_FULL_SCOPE"
          ? 409
          : err.code === "MASTER_NOT_FOUND"
            ? 404
            : err.code === "DUPLICATE_LINE_ITEM_ID" ||
                err.code === "MISSING_LINE_ITEM_ID"
              ? 400
              : 500
      return NextResponse.json(
        { error: err.message, code: err.code, lineItemId: err.lineItemId },
        { status }
      )
    }
    console.error("[plans/save] failed", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    )
  }
}
