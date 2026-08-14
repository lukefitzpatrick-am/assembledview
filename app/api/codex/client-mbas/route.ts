import { NextResponse } from "next/server"
import { campaignsForClientFromPlans } from "@/lib/codex/clientMbas"
import { readPlanMasters } from "@/lib/data/readMediaPlans"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
} from "../_shared"

export const runtime = "nodejs"

/**
 * GET /api/codex/client-mbas?client_id=
 * MBA numbers for the selected client, highest / most recent first.
 */
export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const clientId = Number(url.searchParams.get("client_id"))
  if (!Number.isFinite(clientId) || clientId < 1) {
    return NextResponse.json({ mba_numbers: [] })
  }

  try {
    const masters = await readPlanMasters()
    const campaigns = campaignsForClientFromPlans(masters, clientId)
    return NextResponse.json({
      mba_numbers: campaigns.map((c) => c.mba_number),
      campaigns,
    })
  } catch (error) {
    console.error("Failed to list client MBAs:", error)
    return NextResponse.json(
      {
        error: "Failed to list campaigns",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
