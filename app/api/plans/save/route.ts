import { NextRequest, NextResponse } from "next/server"
import { eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { LINE_CHANNELS } from "@/db/schema"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { getWriteBackend, isXanoMirrorEnabled } from "@/lib/data/backend"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"
import {
  mirrorInputFromSave,
  mirrorPlanToXano,
} from "@/lib/data/mirrorToXano"
import { SavePlanError, savePlanVersion } from "@/lib/data/savePlan"
import { completeStagedIngestAfterSave } from "@/lib/mediaplans/ingest/completeStagedIngestAfterSave"
import { ingestSourceRowRefsFromAttrs } from "@/lib/mediaplans/ingest/ingestSourceRowRefs"
import { mapCampaignStatusForPersist } from "@/lib/mediaplan/campaignStatusGuard"
import { requireRole } from "@/lib/requireRole"
import {
  countVersionLines,
  deleteWorkingDraft,
  getWorkingDraft,
  resolvePublishedVersionId,
} from "@/lib/mediaplan/drafts/serverStore"
import {
  buildStaleBaseCompare,
  isStalePublishedTip,
} from "@/lib/mediaplan/drafts/pill"
import { SAVE_PUBLISHES_IMMEDIATELY } from "@/lib/mediaplan/resolvePostgresSaveMode"
import { shouldClearWorkingDraftAfterSave } from "@/lib/mediaplan/shouldClearWorkingDraftAfterSave"
import { createAdServingRateResolver } from "@/lib/billing/adServingRateResolver"
import {
  normalisePublishedByEmail,
  warnIfPublishMissingPublishedBy,
} from "@/lib/mediaplan/versionPublication"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * POST /api/plans/save — Postgres transactional save (T4a) + best-effort Xano
 * mirror (T4b). Inactive for users while WRITE_BACKEND=xano (default).
 * Page wiring is T4c. Mirror failure never rolls back Postgres.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
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

  const parsed = plansSaveBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const body = parsed.data
  const access = await checkClientMbaAccess(request, body.mbaNumber)
  if (!access.ok) return access.response

  // SV-1 stale-base: another editor published during this session.
  // Compares tip-at-load to the current published pointer — not baseVersionId
  // (the version this cut is forked from). Create sends null → never 409.
  if (body.mode === "publish" || body.mode === "new_version") {
    const currentId = await resolvePublishedVersionId(body.masterId)
    if (
      isStalePublishedTip({
        mode: body.mode,
        tipVersionIdAtLoad: body.tipVersionIdAtLoad,
        currentPublishedVersionId: currentId,
      })
    ) {
      const tipNowId = currentId as number
      const tipAtLoadId = body.tipVersionIdAtLoad as number
      const [yours, tip] = await Promise.all([
        Promise.resolve(body.lineItems.length),
        countVersionLines(tipNowId),
      ])
      return NextResponse.json(
        {
          error: "Published tip moved since you started editing",
          code: "STALE_BASE_VERSION",
          compare: buildStaleBaseCompare({
            baseVersionId: tipAtLoadId,
            currentVersionId: tipNowId,
            yoursLineCount: yours,
            tipLineCount: tip,
          }),
        },
        { status: 409 }
      )
    }
  }

  // X9 safety net — masters are created PG-first via POST /api/mediaplans.
  // Log when this path still inserts (should be rare after X9).
  if (body.ensureMaster) {
    const db = getDb()
    const [existing] = await db
      .select({ id: schema.mediaPlanMasters.id })
      .from(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, body.masterId))
      .limit(1)
    if (!existing) {
      console.warn("[plans/save] ensureMaster safety-net insert firing", {
        masterId: body.masterId,
        mbaNumber: body.ensureMaster.mbaNumber,
      })
      try {
        const { resolveClientIdForMaster } = await import("@/lib/data/writeClients")
        const resolvedClientId = await resolveClientIdForMaster({
          clientId: body.ensureMaster.clientId ?? null,
          mpClientName: body.ensureMaster.mpClientName ?? null,
        })
        await db.insert(schema.mediaPlanMasters).values({
          id: body.masterId,
          mbaNumber: body.ensureMaster.mbaNumber,
          mpClientName: body.ensureMaster.mpClientName ?? null,
          campaignName: body.ensureMaster.campaignName ?? null,
          campaignStatus:
            mapCampaignStatusForPersist(body.ensureMaster.campaignStatus) ??
            body.ensureMaster.campaignStatus ??
            null,
          campaignStartDate: body.ensureMaster.campaignStartDate ?? null,
          campaignEndDate: body.ensureMaster.campaignEndDate ?? null,
          campaignBudgetCents: body.ensureMaster.campaignBudgetCents ?? null,
          clientId: resolvedClientId,
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

  // Misdiagnosis backstop: version-row id sent as masterId → name the mismatch.
  // Never silently remap to mbaNumber's master.
  {
    const db = getDb()
    const [byId] = await db
      .select({
        id: schema.mediaPlanMasters.id,
        mbaNumber: schema.mediaPlanMasters.mbaNumber,
      })
      .from(schema.mediaPlanMasters)
      .where(eq(schema.mediaPlanMasters.id, body.masterId))
      .limit(1)

    if (!byId) {
      const [byMba] = await db
        .select({ id: schema.mediaPlanMasters.id })
        .from(schema.mediaPlanMasters)
        .where(
          sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${body.mbaNumber.trim().toLowerCase()}`
        )
        .limit(1)
      if (byMba) {
        return NextResponse.json(
          {
            error: `masterId ${body.masterId} does not match mba ${body.mbaNumber} (master ${byMba.id})`,
            code: "MASTER_ID_MISMATCH",
          },
          { status: 422 }
        )
      }
    } else if (
      String(byId.mbaNumber ?? "")
        .trim()
        .toLowerCase() !== body.mbaNumber.trim().toLowerCase()
    ) {
      return NextResponse.json(
        {
          error: `masterId ${body.masterId} does not match mba ${body.mbaNumber} (master ${byId.id})`,
          code: "MASTER_ID_MISMATCH",
        },
        { status: 422 }
      )
    }
  }

  const adservRates = {
    video: body.adservvideo ?? 0,
    audio: body.adservaudio ?? 0,
    display: body.adservdisplay ?? 0,
    imp: body.adservimp ?? 0,
  }
  const getRateForMediaType = createAdServingRateResolver(adservRates)

  // VC Stage 1 — same session identity resolution as PC7 draft cleanup below.
  const sessionUser = (gate as { session?: { user?: { email?: string; sub?: string } } })
    .session?.user
  const publishedByEmail = normalisePublishedByEmail(
    sessionUser?.email || sessionUser?.sub || null
  )
  warnIfPublishMissingPublishedBy(body.mode, publishedByEmail, {
    mbaNumber: body.mbaNumber,
  })

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
    getRateForMediaType,
    selectedMonthYears: body.selectedMonthYears,
    clientBillingSchedulePreview: body.clientBillingSchedulePreview as
      | import("@/lib/billing/types").BillingMonth[]
      | null
      | undefined,
    billingOverrides: body.billingOverrides ?? null,
    publishedByEmail,
    baseVersionId: body.baseVersionId ?? null,
    lineItems: body.lineItems.map((l) => ({
      ...l,
      channel: l.channel as (typeof LINE_CHANNELS)[number],
      bursts: l.bursts ?? [],
    })),
  }

  try {
    const result = await savePlanVersion(saveInput)

    // T4b — best-effort Xano mirror AFTER Postgres commit. Never throws.
    // Gated by XANO_MIRROR_ENABLED (default off).
    let mirror: "ok" | "failed" | "disabled" = "disabled"
    let mirrorDurationMs = 0
    let mirrorError: string | undefined
    if (isXanoMirrorEnabled()) {
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

      const mirrored = await mirrorPlanToXano(
        mirrorInputFromSave(
          saveInput,
          {
            versionId: result.versionId,
            versionNumber: result.versionNumber,
            legacySchedules: result.legacySchedules,
          },
          clientName
        )
      )
      mirror = mirrored.mirror
      mirrorDurationMs = mirrored.durationMs
      if (mirrored.mirror === "failed") mirrorError = mirrored.error
    }

    // PC7 / Stage 2b: clear server working draft once tier 3 (save/publish) lands.
    // Flag off: every save clears. Flag on: only matching-base (the draft whose
    // base_version_id is the version just saved from). Stale-base rows stay.
    try {
      const g = gate as { session?: { user?: { email?: string; sub?: string } } }
      const uid = String(g.session?.user?.email || g.session?.user?.sub || "")
      if (uid) {
        const draft = await getWorkingDraft({
          masterId: body.masterId,
          userId: uid,
        })
        if (
          shouldClearWorkingDraftAfterSave({
            savePublishesImmediately: SAVE_PUBLISHES_IMMEDIATELY,
            draftBaseVersionId: draft?.baseVersionId,
            savedFromBaseVersionId: body.baseVersionId,
          })
        ) {
          await deleteWorkingDraft({ masterId: body.masterId, userId: uid })
        }
      }
    } catch (err) {
      console.warn("[PC7] clear working draft after save failed", err)
    }

    const ingestComplete = await completeStagedIngestAfterSave({
      ingestStageId: body.ingestStageId,
      mbaNumber: body.mbaNumber,
      masterId: body.masterId,
      acceptedVersionId: result.versionId,
      savedLineItems: body.lineItems.map((l) => ({
        lineItemId: l.lineItemId,
        channel: l.channel,
        ingestSourceRowRefs: ingestSourceRowRefsFromAttrs(l.attrs),
      })),
      uploadedBy: publishedByEmail,
    })

    return NextResponse.json({
      versionId: result.versionId,
      versionNumber: result.versionNumber,
      lineCount: result.lineCount,
      scheduleRowCount: result.scheduleRowCount,
      published: result.published,
      mirror,
      mirrorDurationMs,
      ...(result.billingCorrection
        ? { billingCorrection: result.billingCorrection }
        : {}),
      ...(result.droppedBillingOverrides &&
      result.droppedBillingOverrides.length > 0
        ? { droppedBillingOverrides: result.droppedBillingOverrides }
        : {}),
      ...(mirror === "failed" ? { mirrorError } : {}),
      ...(ingestComplete.ingestStageRetained
        ? { ingestStageRetained: true }
        : {}),
      ...(ingestComplete.ingestPanelError
        ? { ingestPanelError: ingestComplete.ingestPanelError }
        : {}),
    })
  } catch (err) {
    if (err instanceof SavePlanError) {
      const status =
        err.code === "BOSS006_EMPTY_PUBLISH" ||
        err.code === "C1_FULL_SCOPE" ||
        err.code === "BILLING_OVERRIDE_SUM_VIOLATION" ||
        err.code === "VERSION_PUBLISHED_IMMUTABLE"
          ? 409
          : err.code === "MASTER_NOT_FOUND"
            ? 404
            : err.code === "DUPLICATE_LINE_ITEM_ID" ||
                err.code === "VERSION_ALREADY_EXISTS" ||
                err.code === "MISSING_LINE_ITEM_ID" ||
                err.code === "UNIQUE_VIOLATION"
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
