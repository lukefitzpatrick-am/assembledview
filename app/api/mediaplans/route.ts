import { NextRequest, NextResponse } from "next/server"
import { findExistingMasterByMbaNumber } from "@/lib/api/mediaPlanMasterLookup"
import { requireRole } from "@/lib/requireRole"
import { resolveClientMbaScope } from "@/lib/auth/checkClientMbaAccess"
import {
  fetchMediaPlansListFallback,
  getCachedMediaPlansList,
} from "@/lib/api/mediaPlansListCache"
import { classifySaveUniqueViolation } from "@/lib/data/classifySaveUniqueViolation"
import { createMediaPlanMasterPostgresFirst } from "@/lib/data/writeMediaPlanMasters"
import { readPlanMasters } from "@/lib/data/readMediaPlans"
import { nextMbaNumberAfterTaken } from "@/lib/mediaplan/mbaNumberTaken"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as { code?: string; cause?: { code?: string }; message?: string }
  return (
    e.code === "23505" ||
    e.cause?.code === "23505" ||
    /unique|duplicate key/i.test(String(e.message ?? ""))
  )
}

/** 409 for a new master whose number is already taken. The insert is not committed. */
async function mbaNumberTakenResponse(mbaNumber: string, existingMasterId?: number) {
  let nextMbaNumber: string | null = null
  try {
    const existingPlans = await readPlanMasters()
    const existingMbaNumbers = existingPlans.map((plan) =>
      plan && typeof plan.mba_number === "string" ? plan.mba_number : null,
    )
    nextMbaNumber = nextMbaNumberAfterTaken(existingMbaNumbers, mbaNumber)
  } catch (allocErr) {
    console.error("[api/mediaplans POST] next MBA number failed", allocErr)
  }
  return NextResponse.json(
    {
      error: `A media plan with MBA number "${mbaNumber}" already exists.`,
      code: "MBA_NUMBER_TAKEN",
      ...(existingMasterId != null ? { existingMasterId } : {}),
      ...(nextMbaNumber ? { nextMbaNumber } : {}),
    },
    { status: 409 },
  )
}

export async function POST(request: NextRequest) {
  let mbaNumber = ""
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const data = await request.json()
    const mbaNumberRaw = data.mbanumber ?? data.mba_number ?? ""
    mbaNumber =
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
        return mbaNumberTakenResponse(mbaNumber, existing.id)
      }
    } catch (preCheckErr) {
      console.error("MBA uniqueness pre-check failed (proceeding with create):", preCheckErr)
    }

    const { master } = await createMediaPlanMasterPostgresFirst({
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
    })
  } catch (error) {
    console.error("Failed to create media plan:", error)

    let errorMessage = "Failed to create media plan"
    let statusCode = 500

    if (mbaNumber && isUniqueViolation(error)) {
      const classified = classifySaveUniqueViolation(error, { creatingNewMaster: true })
      if (classified.code === "MBA_NUMBER_TAKEN") {
        return mbaNumberTakenResponse(mbaNumber)
      }
    }
    if (error instanceof Error && error.message) {
      errorMessage = error.message
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode })
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

      try {
        const mergedFallbackData = await fetchMediaPlansListFallback()
        const plans = scope.isClient
          ? mergedFallbackData.filter((plan) => scope.allows(planMbaNumber(plan)))
          : mergedFallbackData
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
