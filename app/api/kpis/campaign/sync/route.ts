import { NextResponse, type NextRequest } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { syncCampaignKpis } from "@/lib/kpi/campaignKpi"
import {
  handleCampaignKpiSync,
  mapKpiWriteCatch,
  readKpiJsonRequest,
} from "@/lib/kpi/kpiWriteHandlers"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const json = await readKpiJsonRequest(request)
    if (!("ok" in json)) {
      return NextResponse.json(json.body, { status: json.status })
    }
    const result = await handleCampaignKpiSync(json.data, {
      sync: syncCampaignKpis,
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("POST /api/kpis/campaign/sync:", error)
    const mapped = mapKpiWriteCatch(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
