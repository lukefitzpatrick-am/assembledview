import { NextResponse } from "next/server"
import { getMbaTimeSummary } from "@/lib/myhours/timeSummary"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
} from "../../_shared"

export const runtime = "nodejs"

/**
 * GET /api/codex/time/summary?mba=...
 * Hours-to-date for one MBA (admin/Codex shadow only — commercially sensitive).
 */
export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const mba = (url.searchParams.get("mba") ?? "").trim()
    if (!mba) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "mba query is required.",
        },
        { status: 400 }
      )
    }

    const summary = await getMbaTimeSummary(mba)
    return NextResponse.json(summary)
  } catch (error) {
    console.error("Failed to load MBA time summary:", error)
    return NextResponse.json(
      {
        error: "Failed to load time summary",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
