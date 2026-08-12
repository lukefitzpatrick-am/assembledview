import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { loadM365ReconciliationReport } from "@/lib/m365/reconciliation.server"

export const runtime = "nodejs"

/** Read-only M365 client ↔ Graph reconciliation skeleton (M4). No writes. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const report = await loadM365ReconciliationReport()
    return NextResponse.json(report)
  } catch (e) {
    console.error("[admin/m365-reconciliation]", e)
    return NextResponse.json(
      { error: "M365 reconciliation unavailable" },
      { status: 500 }
    )
  }
}
