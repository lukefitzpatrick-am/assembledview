import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { getXanoBaseUrl, xanoAuthHeaderRecord, xanoPostHeaderRecord } from "@/lib/api/xano"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  applyPlanCServerAuthority,
  computeAuthoritativeFinancials,
  resolvePlanCServerAuthorityMode,
  type AuthoritativeFinancials,
} from "@/lib/finance/authority/computeAndPersist"
import { fetchBillingOverridesForVersion } from "@/lib/finance/billingOverrides"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { resolveFeeLoadingForVersion } from "@/lib/finance/feeSnapshots"
import { clearRelevantPlanVersionsCache } from "@/lib/finance/relevantPlanVersions"
import { recomputeAndValidateBillingScheduleOnSave } from "@/lib/finance/recomputeBillingScheduleOnSave"
import {
  dualWritePlanRowsForVersion,
  resolvePlanCRowsDualWriteMode,
} from "@/lib/finance/rows/dualWrite"
import { diffBillingSchedules } from "@/lib/finance/scheduleDiff"
import { writeScheduleDiffEdits } from "@/lib/finance/writeFinanceAuditEdits"
import { requireFinanceAdmin } from "@/lib/requireRole"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_LONG_TIMEOUT_MS = 30_000

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

    let mediaPlansBaseUrl: string
    try {
      mediaPlansBaseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
    } catch {
      return NextResponse.json(
        { error: "XANO_MEDIA_PLANS_BASE_URL (or XANO_MEDIAPLANS_BASE_URL) is not configured" },
        { status: 500 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      )
    }

    // Domain 5 Stage 2.2b — read current schedule before PATCH so we can audit the diff.
    let oldSchedule: unknown = null
    let versionRow: Record<string, unknown> | null = null
    try {
      const currentVersionRes = await axios.get(`${mediaPlansBaseUrl}/media_plan_versions/${encodeURIComponent(id)}`, { headers: xanoAuthHeaderRecord(), timeout: XANO_LONG_TIMEOUT_MS })
      versionRow =
        currentVersionRes.data && typeof currentVersionRes.data === "object"
          ? (currentVersionRes.data as Record<string, unknown>)
          : null
      const raw = versionRow?.billingSchedule
      oldSchedule = typeof raw === "string" ? JSON.parse(raw) : raw
    } catch (preReadError) {
      console.error("[billing-schedule-patch] pre-read failed; audit will be empty", {
        id,
        message: preReadError instanceof Error ? preReadError.message : String(preReadError),
      })
    }

    const bodyRecord = body as Record<string, unknown>
    // Allow omit: generate from recompute when lineItems present (C1).
    const clientSentSchedule = Object.prototype.hasOwnProperty.call(bodyRecord, "billingSchedule")
    const clientBillingSchedule = clientSentSchedule
      ? bodyRecord.billingSchedule
      : undefined

    if (!clientSentSchedule) {
      // Historically required billingSchedule; keep requiring it unless lineItems
      // are supplied so the server can regenerate.
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
    let inputsHash: string | undefined
    const patchPayload: Record<string, unknown> = {}
    let authoritativeForRows: AuthoritativeFinancials | null = null
    let overrideRowsForDualWrite: Awaited<
      ReturnType<typeof fetchBillingOverridesForVersion>
    > = []

    const financialLineItems = (Array.isArray(bodyRecord.lineItems)
      ? bodyRecord.lineItems
      : Array.isArray(bodyRecord.financialLineItems)
        ? bodyRecord.financialLineItems
        : null) as LineItemInput[] | null
    const liveFeeLoading = (bodyRecord.feeLoading ??
      bodyRecord.fee_loading ??
      null) as FeeLoading | null
    let feeLoading = liveFeeLoading
    if (liveFeeLoading) {
      const resolved = await resolveFeeLoadingForVersion({
        versionId: id,
        liveFeeLoading,
        meta: {
          mba_number:
            versionRow?.mba_number != null ? String(versionRow.mba_number) : undefined,
          version: versionRow?.version_number as string | number | undefined,
        },
        baseUrl: mediaPlansBaseUrl,
      })
      feeLoading = resolved.feeLoading
    }

    if (financialLineItems && financialLineItems.length > 0 && feeLoading) {
      const overrideRows = await fetchBillingOverridesForVersion(id, {
        baseUrl: mediaPlansBaseUrl,
      })
      overrideRowsForDualWrite = overrideRows
      const startRaw = versionRow?.campaign_start_date
      const endRaw = versionRow?.campaign_end_date
      const recompute = recomputeAndValidateBillingScheduleOnSave({
        lineItems: financialLineItems,
        feeLoading,
        clientBillingSchedule: clientSentSchedule ? clientBillingSchedule : null,
        overrideRows,
        opts: {
          ...(startRaw ? { campaignStart: new Date(String(startRaw)) } : {}),
          ...(endRaw ? { campaignEnd: new Date(String(endRaw)) } : {}),
        },
        meta: {
          mba_number:
            versionRow?.mba_number != null ? String(versionRow.mba_number) : undefined,
          version: versionRow?.version_number as string | number | undefined,
        },
        version: versionRow ?? undefined,
      })
      if (!recompute.ok) {
        return NextResponse.json(recompute.body, { status: recompute.status })
      }
      scheduleToPersist = recompute.billingSchedule
      inputsHash = recompute.inputs_hash
      let deliveryToPersist = recompute.generatedFromServer
        ? recompute.deliverySchedule
        : undefined

      // Plan C S1 — server financial authority (after C1 validation passes).
      // Plan C S2 — also compute when PLANC_ROWS_DUAL_WRITE=on (independent of enforce).
      const authorityMode = resolvePlanCServerAuthorityMode()
      const rowsDualWriteOn = resolvePlanCRowsDualWriteMode() === "on"
      if (authorityMode !== "off" || rowsDualWriteOn) {
        const authoritative = computeAuthoritativeFinancials({
          lineItems: financialLineItems,
          feeLoading,
          overrides: overrideRows,
          monthScope: {
            ...(startRaw ? { campaignStart: new Date(String(startRaw)) } : {}),
            ...(endRaw ? { campaignEnd: new Date(String(endRaw)) } : {}),
          },
        })
        authoritativeForRows = authoritative
        if (authorityMode !== "off") {
          const clientBilling = Array.isArray(scheduleToPersist)
            ? scheduleToPersist
            : authoritative.billingSchedule
          const decision = applyPlanCServerAuthority({
            mode: authorityMode,
            clientBillingSchedule: clientBilling as typeof authoritative.billingSchedule,
            clientDeliverySchedule: deliveryToPersist ?? authoritative.deliverySchedule,
            authoritative,
            meta: {
              mba_number:
                versionRow?.mba_number != null
                  ? String(versionRow.mba_number)
                  : undefined,
              version: versionRow?.version_number as string | number | undefined,
            },
          })
          if (authorityMode === "enforce") {
            scheduleToPersist = decision.billingSchedule
            deliveryToPersist = decision.deliverySchedule
          }
        }
      }

      patchPayload.billingSchedule = scheduleToPersist
      patchPayload.inputs_hash = inputsHash
      patchPayload.rebill_needed = false
      if (deliveryToPersist != null) {
        patchPayload.deliverySchedule = deliveryToPersist
        patchPayload.delivery_schedule = deliveryToPersist
      }
    } else {
      if (scheduleToPersist == null) {
        return NextResponse.json(
          { error: "billingSchedule cannot be null — omit with lineItems to regenerate, or send a schedule" },
          { status: 400 }
        )
      }
      patchPayload.billingSchedule = scheduleToPersist
      console.warn(
        "[billing-schedule-patch] C1 skipped (no lineItems+feeLoading); persisting client schedule as-is"
      )
    }

    const xanoResponse = await axios.patch(`${mediaPlansBaseUrl}/media_plan_versions/${encodeURIComponent(id)}`, patchPayload, { headers: xanoPostHeaderRecord(), timeout: XANO_LONG_TIMEOUT_MS })

    clearRelevantPlanVersionsCache()

    // Plan C S2-P2 — dual-write typed rows + snapshot_checksum (soft-fail).
    if (authoritativeForRows && financialLineItems && financialLineItems.length > 0) {
      try {
        await dualWritePlanRowsForVersion({
          versionId: id,
          mba_number:
            versionRow?.mba_number != null
              ? String(versionRow.mba_number)
              : "",
          authoritative: authoritativeForRows,
          lineItems: authoritativeForRows.lineItems.length
            ? authoritativeForRows.lineItems
            : financialLineItems,
          overrides: overrideRowsForDualWrite,
          baseUrl: mediaPlansBaseUrl,
        })
      } catch (rowsError) {
        console.warn("[billing-schedule-patch] plan rows dual-write failed (non-fatal)", {
          id,
          message: rowsError instanceof Error ? rowsError.message : String(rowsError),
        })
      }
    }

    // Domain 5 Stage 2.2b — audit writes after successful PATCH.
    // Failures are logged, not propagated. Schedule save remains authoritative.
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
      data: xanoResponse.data,
      ...(inputsHash ? { inputs_hash: inputsHash, rebill_needed: false } : {}),
    })
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status || 500
    console.error("[api/mediaplans/versions/billing-schedule PATCH]", {
      error,
      status,
      upstream: (error as { response?: { data?: unknown } })?.response?.data,
    })
    return NextResponse.json({ error: "Failed to patch billing schedule" }, { status })
  }
}
