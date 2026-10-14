import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { loadOnDemandDeckStatus } from "@/lib/reports/deckJobs/onDemandDeck"
import { findOnDemandDeck } from "@/lib/reports/deckJobs/onDemandDeckStore"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const { runId } = await context.params
  const result = await loadOnDemandDeckStatus(runId, {
    findRun: findOnDemandDeck,
    canSeeMba: async (mbaNumber) => {
      const access = await checkClientMbaAccess(request, mbaNumber)
      return access.ok
    },
  })
  if ("error" in result) {
    const status = result.error === "forbidden" ? 403 : 404
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result.body)
}
