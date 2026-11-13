import { NextResponse } from "next/server"
import { countTasksByMba } from "@/lib/codex/repo"
import { parseMbaNumbersQuery } from "@/lib/codex/queryHelpers"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../../_shared"

export const runtime = "nodejs"

/**
 * GET /api/codex/tasks/counts?mba=FOO001,BAR002
 * Open + overdue task counts per MBA (campaign badge feed).
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const mbaNumbers = parseMbaNumbersQuery(url.searchParams.get("mba"))
    if (mbaNumbers.length === 0) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "mba query is required (comma-separated MBA numbers).",
        },
        { status: 400 }
      )
    }

    // B42 (C-211): a private project's tasks count only for people who can see it.
    const items = await countTasksByMba(mbaNumbers, undefined, undefined, sessionEmail(auth.session))
    return NextResponse.json({ items })
  } catch (error) {
    console.error("Failed to count tasks by MBA:", error)
    return NextResponse.json(
      {
        error: "Failed to count tasks",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
