import { NextResponse } from "next/server"
import { expireStaleProposals } from "@/lib/fireflies/proposalRepo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
} from "../../_shared"

export const runtime = "nodejs"

/**
 * POST /api/codex/proposals/expire-stale
 * Expires proposed rows older than 21 days. Does not delete them.
 */
export async function POST(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const expired = await expireStaleProposals()
    return NextResponse.json({ expired })
  } catch (error) {
    console.error("Failed to expire stale proposals:", error)
    return NextResponse.json(
      {
        error: "Failed to expire proposals",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
