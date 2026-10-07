import { NextResponse } from "next/server"
import { countTasksByStatus } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
} from "../../_shared"
import { parseTaskListFilters } from "../route"

export const runtime = "nodejs"

/**
 * GET /api/codex/tasks/status-counts
 * Same filters as GET /api/codex/tasks. One GROUP BY, five buckets.
 */
export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const parsed = await parseTaskListFilters(request)
    if (!parsed.ok) return parsed.error

    const counts = await countTasksByStatus(parsed.filters)
    return NextResponse.json(counts)
  } catch (error) {
    console.error("Failed to count tasks by status:", error)
    return NextResponse.json(
      {
        error: "Failed to count tasks",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
