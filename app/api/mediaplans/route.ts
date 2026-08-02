import { NextRequest, NextResponse } from "next/server"
import { findExistingMasterByMbaNumber } from "@/lib/api/mediaPlanMasterLookup"
import { requireRole } from "@/lib/requireRole"
import { resolveClientMbaScope } from "@/lib/auth/checkClientMbaAccess"
import {
  fetchMediaPlansListFallback,
  getCachedMediaPlansList,
} from "@/lib/api/mediaPlansListCache"
import { createMediaPlanMasterPostgresFirst } from "@/lib/data/writeMediaPlanMasters"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const data = await request.json()
    const mbaNumberRaw = data.mbanumber ?? data.mba_number ?? ""
    const mbaNumber =
      typeof mbaNumberRaw === "string" ? mbaNumberRaw.trim() : String(mbaNumberRaw).trim()

    if (!mbaNumber) {
      return NextResponse.json(
        { error: "MBA number is required", code: "MBA_NUMBER_REQUIRED" },
        { status: 400 }
      )
    }

    try {
      const existing = await findExistingMasterByMbaNumber(mbaNumber)
      if (existing) {
        return NextResponse.json(
          {
            error: `A media plan with MBA number "${mbaNumber}" already exists.`,
            code: "MBA_NUMBER_TAKEN",
            existingMasterId: existing.id,
          },
          { status: 409 }
        )
      }
    } catch (preCheckErr) {
      console.error("MBA uniqueness pre-check failed (proceeding with create):", preCheckErr)
    }

    const { master, mirror } = await createMediaPlanMasterPostgresFirst({
      mbaNumber,
      mpClientName: data.mp_client_name ?? null,
      campaignName: data.mp_campaignname ?? null,
      campaignStatus: data.mp_campaignstatus || "Draft",
      campaignStartDate: data.mp_campaigndates_start ?? null,
      campaignEndDate: data.mp_campaigndates_end ?? null,
      campaignBudget: data.mp_campaignbudget ?? null,
      clientId:
        typeof data.client_id === "number"
          ? data.client_id
          : typeof data.clients_id === "number"
            ? data.clients_id
            : null,
    })

    // Version creation is handled separately by handleSaveMediaPlanVersion /
    // POST /api/plans/save — this endpoint only allocates the master identity.
    return NextResponse.json({
      master,
      mirror,
    })
  } catch (error) {
    console.error("Failed to create media plan:", error)

    let errorMessage = "Failed to create media plan"
    let statusCode = 500
    let code: string | undefined

    if (error && typeof error === "object" && "code" in error) {
      const pgCode = String((error as { code?: unknown }).code ?? "")
      if (pgCode === "23505") {
        errorMessage = "A media plan with this MBA number already exists."
        statusCode = 409
        code = "MBA_NUMBER_TAKEN"
      }
    } else if (error instanceof Error && error.message) {
      errorMessage = error.message
    }

    return NextResponse.json(
      { error: errorMessage, ...(code ? { code } : {}) },
      { status: statusCode }
    )
  }
}

function planMbaNumber(plan: unknown): string {
  if (!plan || typeof plan !== "object") return ""
  const raw = (plan as { mba_number?: unknown }).mba_number
  return typeof raw === "string" ? raw.trim() : String(raw ?? "").trim()
}

export async function GET(request: NextRequest) {
  const t0 = Date.now()
  try {
    // Staff: full list (unchanged). Clients: same list source, filtered to MBA scope.
    const scope = await resolveClientMbaScope(request)
    if (!scope.ok) return scope.response
    if (!scope.isClient) {
      // Non-client must still be admin/manager (role-less sessions fail closed).
      const gate = await requireRole(request, ["admin"])
      if ("response" in gate) return gate.response
    }

    try {
      const { data, stale, fetchedAt } = await getCachedMediaPlansList()
      const plans = scope.isClient
        ? data.filter((plan) => scope.allows(planMbaNumber(plan)))
        : data
      console.log(
        `[MEDIAPLANS_LIST] cache hit/fresh in ${Date.now() - t0}ms count=${plans.length}` +
          (scope.isClient ? ` (client-filtered from ${data.length})` : "") +
          ` stale=${stale}`
      )
      const headers: Record<string, string> = {}
      if (fetchedAt != null) {
        headers["x-cache-fetched-at"] = String(fetchedAt)
      }
      if (stale) {
        headers["x-warning"] = "served-stale-after-upstream-failure"
      }
      return NextResponse.json(plans, {
        status: 200,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      })
    } catch (versionsError) {
      console.log(
        "MediaPlanVersions failed, trying original endpoint:",
        versionsError instanceof Error ? versionsError.message : versionsError
      )

      try {
        const mergedFallbackData = await fetchMediaPlansListFallback()
        const plans = scope.isClient
          ? mergedFallbackData.filter((plan) => scope.allows(planMbaNumber(plan)))
          : mergedFallbackData
        console.log(
          `[MEDIAPLANS_LIST] fallback in ${Date.now() - t0}ms count=${plans.length}`
        )
        return NextResponse.json(plans)
      } catch (fallbackError) {
        console.error("Fallback endpoint also failed:", fallbackError)
        throw versionsError
      }
    }
  } catch (error) {
    console.error("Failed to fetch media plans:", error)

    let errorMessage = "Failed to fetch media plans"
    let statusCode = 500

    if (error instanceof Error && error.message) {
      errorMessage = error.message
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}
