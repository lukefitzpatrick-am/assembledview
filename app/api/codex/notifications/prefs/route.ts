import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { setEmailDigest } from "@/lib/codex/notificationsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../_shared"
import { projectsErrorResponse } from "../../projects/_gate"

export const runtime = "nodejs"

/**
 * Your daily email digest switch (B41): PUT `{ email_digest: boolean }`.
 * Default on. Your own row only. Behind codex_notifications; 503 before 0118.
 */
export async function PUT(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_notifications"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.email_digest !== "boolean") return jsonError(400, "bad_request", "Send { email_digest: true | false }.")
  try {
    return NextResponse.json({ email_digest: await setEmailDigest(email, body.email_digest) })
  } catch (error) {
    return projectsErrorResponse(error, "save notification settings")
  }
}
