import { NextResponse } from "next/server"

import { isCodexNotificationsEnabled } from "@/lib/codex/flag"
import { BELL_LIMIT_DEFAULT, listBell } from "@/lib/codex/notificationsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../_shared"
import { projectsErrorResponse } from "../projects/_gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The bell (B41): your recent notifications, newest first (`?limit=` 1 to
 * 100, default 30), the unread count and your email digest switch. Only
 * live tasks you can still see. Behind codex_notifications (which needs
 * codex_projects); 503 before 0118.
 */
export async function GET(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexNotificationsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const raw = new URL(request.url).searchParams.get("limit")
  let limit = BELL_LIMIT_DEFAULT
  if (raw != null) {
    if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) return jsonError(400, "invalid_limit", "limit must be 1 to 100.")
    limit = Number(raw)
  }
  try {
    return NextResponse.json(await listBell(email, limit))
  } catch (error) {
    return projectsErrorResponse(error, "list notifications")
  }
}
