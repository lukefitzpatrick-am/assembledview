import { NextRequest, NextResponse } from "next/server"
import {
  createCampaignKpis,
  deleteCampaignKpi,
  fetchCampaignKpis,
  updateCampaignKpi,
} from "@/lib/kpi/campaignKpi"
import { campaignKpiCreateBodySchema, campaignKpiPatchBodySchema } from "@/lib/kpi/types"

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
    const data = await fetchCampaignKpis(mbaNumber, versionNumber)
    return NextResponse.json(data)
  } catch (error) {
    console.error("GET /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = campaignKpiCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const results = await createCampaignKpis(parsed.data)
    return NextResponse.json(results, { status: 201 })
  } catch (error) {
    console.error("POST /api/kpis/campaign:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = campaignKpiPatchBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { id, ...rest } = parsed.data
    const result = await updateCampaignKpi(id, rest)
    if (result === null) {
      return NextResponse.json(
        { error: "Failed to update campaign KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("PATCH /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id?.trim()) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }
    const ok = await deleteCampaignKpi(Number(id))
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to delete campaign KPI" },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/kpis/campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
