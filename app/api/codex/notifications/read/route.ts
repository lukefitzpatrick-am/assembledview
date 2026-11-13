import { NextResponse } from "next/server"

import { isCodexNotificationsEnabled } from "@/lib/codex/flag"
import { markNotificationsRead } from "@/lib/codex/notificationsRepo"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../_shared"
import { projectsErrorResponse } from "../../projects/_gate"

export const runtime = "nodejs"

/**
 * Mark your notifications read (B41): `{ ids: [..] }` (1 to 200 of your own;
 * anyone else's ids change nothing) or `{ all: true }`. Behind
 * codex_notifications; 503 before 0118.
 */
export async function POST(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexNotificationsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  let target: { ids: number[] } | { all: true }
  if (body && body.all === true && body.ids === undefined) {
    target = { all: true }
  } else if (body && Array.isArray(body.ids) && body.ids.length >= 1 && body.ids.length <= 200 && body.all === undefined) {
    const ids = body.ids.map((v) => parseId(v))
    if (ids.some((v) => v == null)) return jsonError(400, "invalid_ids", "ids must be notification ids.")
    target = { ids: ids as number[] }
  } else {
    return jsonError(400, "bad_request", "Send { ids: [...] } or { all: true }.")
  }
  try {
    return NextResponse.json({ updated: await markNotificationsRead(email, target) })
  } catch (error) {
    return projectsErrorResponse(error, "mark notifications read")
  }
}
