import { NextRequest, NextResponse } from "next/server"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { requireRole } from "@/lib/requireRole"
import {
  createCampaignKpis,
  deleteCampaignKpi,
  fetchCampaignKpis,
  updateCampaignKpi,
} from "@/lib/kpi/campaignKpi"
import {
  handleCampaignKpiDelete,
  handleCampaignKpiPatch,
  handleCampaignKpiPost,
  mapKpiWriteCatch,
  readKpiJsonRequest,
} from "@/lib/kpi/kpiWriteHandlers"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const mbaNumber = request.nextUrl.searchParams.get("mbaNumber")?.trim() ?? ""
    const versionRaw = request.nextUrl.searchParams.get("versionNumber")
    if (!mbaNumber || versionRaw === null || versionRaw.trim() === "") {
      return NextResponse.json(
        { error: "mbaNumber and versionNumber are required" },
        { status: 400 },
      )
    }
    const versionNumber = Number(versionRaw)
    if (!Number.isFinite(versionNumber)) {
      return NextResponse.json(
        { error: "versionNumber must be a number" },
        { status: 400 },
      )
    }

    const access = await checkClientMbaAccess(request, mbaNumber)
    if (!access.ok) return access.response

    const data = await fetchCampaignKpis(mbaNumber, versionNumber)
    return NextResponse.json(data)
  } catch (error) {
    console.error("GET /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const json = await readKpiJsonRequest(request)
    if (!("ok" in json)) {
      return NextResponse.json(json.body, { status: json.status })
    }
    const result = await handleCampaignKpiPost(json.data, {
      create: createCampaignKpis,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("POST /api/kpis/campaign:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const json = await readKpiJsonRequest(request)
    if (!("ok" in json)) {
      return NextResponse.json(json.body, { status: json.status })
    }
    const result = await handleCampaignKpiPatch(json.data, {
      update: updateCampaignKpi,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("PATCH /api/kpis/campaign:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const result = await handleCampaignKpiDelete(
      request.nextUrl.searchParams.get("id"),
      { delete: deleteCampaignKpi },
    )
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("DELETE /api/kpis/campaign:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
