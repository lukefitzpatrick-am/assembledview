import { NextResponse } from "next/server"

import { parseCreateFieldInput } from "@/lib/codex/customFields"
import { createCustomField, listProjectFields } from "@/lib/codex/customFieldsRepo"
import { isFeatureOn } from "@/lib/features/server"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

/** GET (B40): the project's custom fields and its card chip settings. */
export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isFeatureOn("codex_projects"))) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const id = parseId((await context.params).id)
  if (id == null) return jsonError(404, "not_found")
  try {
    const result = await listProjectFields(id, email)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ fields: result.fields, card_fields: result.card_fields })
  } catch (error) {
    return projectsErrorResponse(error, "list fields")
  }
}

/** POST `{ name, field_type: single_select | multi_select, options: [labels], done_option? }` (B40). 20 per project. */
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
  const parsed = parseCreateFieldInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await createCustomField(id, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ field: result.field }, { status: 201 })
  } catch (error) {
    return projectsErrorResponse(error, "create field")
  }
}
