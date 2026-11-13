import { NextResponse } from "next/server"

import { setProgressField } from "@/lib/codex/customFieldsRepo"
import { isCodexProgressFieldEnabled, isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT `{ field_id: number | null }` (B42, plan 4.2): link a single-select
 * field with a done option as this project's progress field, or unlink.
 * Behind codex_projects and codex_progress_field (404 before auth when off);
 * a field that cannot be linked is 409 progress_field_invalid; 503 before 0118.
 */
export async function PUT(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled()) || !(await isCodexProgressFieldEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const body = (await request.json().catch(() => null)) as { field_id?: unknown } | null
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body.field_id : undefined
  if (raw !== null && !(typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0)) {
    return jsonError(400, "invalid_field_id", "field_id must be a field id or null.")
  }
  try {
    const result = await setProgressField(id, email, raw)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ progress_field_id: result.progress_field_id })
  } catch (error) {
    return projectsErrorResponse(error, "save the progress field")
  }
}
