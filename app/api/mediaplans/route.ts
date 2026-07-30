import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { toMelbourneDateString } from "@/lib/timezone"
import { xanoAuthHeaderRecord, xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"
import { findExistingMasterByMbaNumber } from "@/lib/api/mediaPlanMasterLookup"
import { requireRole } from "@/lib/requireRole"
import { resolveClientMbaScope } from "@/lib/auth/checkClientMbaAccess"
import {
  fetchMediaPlansListFallback,
  getCachedMediaPlansList,
} from "@/lib/api/mediaPlansListCache"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

const XANO_TIMEOUT_MS = 15_000

export async function POST(request: NextRequest) {
  try {
    const gate = await requireRole(request, ["admin", "manager"])
    if ("response" in gate) return gate.response

    const data = await request.json()
    const mbaNumberRaw = data.mbanumber ?? data.mba_number ?? ""
    const mbaNumber = typeof mbaNumberRaw === "string" ? mbaNumberRaw.trim() : String(mbaNumberRaw).trim()

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
    
    // First, create MediaPlanMaster record
    // For new media plans, version_number is always set to 1
    const mediaPlanMasterData = {
      mp_client_name: data.mp_client_name,
      mba_number: mbaNumber,
      mp_campaignname: data.mp_campaignname,
      version_number: 1, // Always 1 for new media plans created from create page
      campaign_status: data.mp_campaignstatus || "Draft",
      campaign_start_date: data.mp_campaigndates_start ? toMelbourneDateString(data.mp_campaigndates_start) : data.mp_campaigndates_start,
      campaign_end_date: data.mp_campaigndates_end ? toMelbourneDateString(data.mp_campaigndates_end) : data.mp_campaigndates_end,
      mp_campaignbudget: data.mp_campaignbudget
    }

    // Create MediaPlanMaster
    const masterResponse = await axios.post(xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]), mediaPlanMasterData, { headers: xanoPostHeaderRecord(), timeout: XANO_TIMEOUT_MS })
    
    // Note: Version creation is handled separately by handleSaveMediaPlanVersion 
    // which includes all fields (brand, client_contact, po_number, mediatype flags, billing schedule)
    // This prevents duplicate entries with incomplete data
    
    return NextResponse.json({
      master: masterResponse.data
    })
  } catch (error) {
    console.error("Failed to create media plan:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to create media plan";
    let statusCode = 500;
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      // Extract error message from Xano response
      const xanoError = error.response?.data?.error || error.response?.data?.message;
      errorMessage = xanoError || error.message || "Failed to create media plan";
      statusCode = error.response?.status || 500;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
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
      const gate = await requireRole(request, ["admin", "manager"])
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
    console.error("Failed to fetch media plans:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to fetch media plans";
    let statusCode = 500;
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      errorMessage = error.response?.data?.message || error.message || "Failed to fetch media plans";
      statusCode = error.response?.status || 500;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
