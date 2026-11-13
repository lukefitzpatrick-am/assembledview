import { NextResponse } from "next/server"
import { isCodexSearchEnabled } from "@/lib/codex/flag"
import { codexSearchLimit, normaliseCodexSearchQuery } from "@/lib/codex/search"
import { searchCodex } from "@/lib/codex/searchRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../_shared"

export const runtime = "nodejs"

/**
 * GET /api/codex/search?q=&limit= (F8). Tasks (title, MBA, description,
 * comments), Inbox items waiting for a decision and meetings.
 * Gates: codex_v2 off 404, codex_search off 404, no session 401, not staff
 * 403. Staff see what the lists show (decision 52: internal meetings too).
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexSearchEnabled())) return jsonError(404, "not_found")

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const q = normaliseCodexSearchQuery(url.searchParams.get("q"))
  if (!q) return jsonError(400, "query_too_short", "Type at least 2 characters to search")

  try {
    const results = await searchCodex(q, codexSearchLimit(url.searchParams.get("limit")), undefined, sessionEmail(auth.session))
    return NextResponse.json(results)
  } catch (error) {
    console.error("Codex search failed:", error)
    return jsonError(500, "search_failed", "Search failed. Try again.")
  }
}
