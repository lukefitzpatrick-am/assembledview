import { NextResponse } from "next/server"

import { parseCardFieldsInput } from "@/lib/codex/customFields"
import { setProjectCardFields } from "@/lib/codex/customFieldsRepo"
import { isFeatureOn } from "@/lib/features/server"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** PUT `{ card_fields: [{ key: "field:<id>", show }] }` (B40): which field chips show on this project's cards, for everyone. */
export async function PUT(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  const parsed = parseCardFieldsInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await setProjectCardFields(id, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ card_fields: result.card_fields })
  } catch (error) {
    return projectsErrorResponse(error, "save card fields")
  }
}
