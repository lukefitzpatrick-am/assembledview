import { NextResponse } from "next/server"

import axios from "axios"

import { getXanoBaseUrl } from "@/lib/api/xano"

import { getCurrentUser } from "@/lib/auth/getCurrentUser"

import { clearRelevantPlanVersionsCache } from "@/lib/finance/relevantPlanVersions"

import { diffBillingSchedules } from "@/lib/finance/scheduleDiff"

import { writeScheduleDiffEdits } from "@/lib/finance/writeFinanceAuditEdits"



const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

const XANO_LONG_TIMEOUT_MS = 30_000



export async function PATCH(

  request: Request,

  { params }: { params: Promise<{ id: string }> }

) {

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

    if (!body || typeof body !== "object" || !("billingSchedule" in body)) {

      return NextResponse.json(

        { error: "Request body must include billingSchedule" },

        { status: 400 }

      )

    }

    const { billingSchedule: newSchedule } = body as { billingSchedule: unknown }



    // Domain 5 Stage 2.2b — read current schedule before PATCH so we can audit the diff.

    let oldSchedule: unknown = null

    try {

      const currentVersionRes = await axios.get(
        `${mediaPlansBaseUrl}/media_plan_versions/${encodeURIComponent(id)}`,
        { timeout: XANO_LONG_TIMEOUT_MS }
      )

      const raw = currentVersionRes.data?.billingSchedule

      oldSchedule = typeof raw === "string" ? JSON.parse(raw) : raw

    } catch (preReadError) {

      console.error("[billing-schedule-patch] pre-read failed; audit will be empty", {

        id,

        message: preReadError instanceof Error ? preReadError.message : String(preReadError),

      })

    }



    const xanoResponse = await axios.patch(
      `${mediaPlansBaseUrl}/media_plan_versions/${encodeURIComponent(id)}`,
      { billingSchedule: newSchedule },
      { timeout: XANO_LONG_TIMEOUT_MS }
    )



    clearRelevantPlanVersionsCache()



    // Domain 5 Stage 2.2b — audit writes after successful PATCH.

    // Failures are logged, not propagated. Schedule save remains authoritative.

    try {

      const user = await getCurrentUser(request)

      const changes = diffBillingSchedules(oldSchedule, newSchedule)

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



    return NextResponse.json({ ok: true, data: xanoResponse.data })

  } catch (error) {

    const message =

      (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data

        ?.message ||

      (error as { message?: string })?.message ||

      "Failed to patch billing schedule"

    return NextResponse.json({ error: message }, { status: 500 })

  }

}

