import { NextResponse } from "next/server"

import { isFeatureOn } from "@/lib/features/server"
import { parseId, parseReorderInput } from "@/lib/codex/projects"
import { reorderSections } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** POST `{ ordered_ids }`: every section of the project once, in the new order (400 otherwise). */
export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseReorderInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await reorderSections(id, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ items: result.sections })
  } catch (error) {
    return projectsErrorResponse(error, "reorder sections")
  }
}
