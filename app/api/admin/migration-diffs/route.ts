import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { getDataBackend, getDataBackendFor } from "@/lib/data/backend"
import { summarizeShadowDiffs } from "@/lib/data/shadowDiff"

export const runtime = "nodejs"

/**
 * Admin-only summary of DATA_BACKEND=shadow field-level diffs from the last 24h
 * (in-memory, process-local). Includes per-domain counts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  const summary = summarizeShadowDiffs(24 * 60 * 60 * 1000)
  return NextResponse.json({
    dataBackend: getDataBackend(),
    dataBackendsByDomain: {
      reference: getDataBackendFor("reference"),
      publishers: getDataBackendFor("publishers"),
      clients: getDataBackendFor("clients"),
    },
    ...summary,
  })
}
