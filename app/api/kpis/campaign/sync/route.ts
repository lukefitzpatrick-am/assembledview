import { NextResponse, type NextRequest } from "next/server"
import { syncCampaignKpis } from "@/lib/kpi/campaignKpi"
import { campaignKpiCreateBodySchema } from "@/lib/kpi/types"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = campaignKpiCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join("; ") || "Validation failed"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const results = await syncCampaignKpis(parsed.data)
    return NextResponse.json(results, { status: 200 })
  } catch (error) {
    console.error("POST /api/kpis/campaign/sync:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
