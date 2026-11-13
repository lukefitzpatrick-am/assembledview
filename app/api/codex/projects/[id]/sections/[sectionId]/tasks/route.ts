import { NextResponse } from "next/server"

import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseCompletedParam } from "@/lib/codex/projectBoard"
import { parseId, parseMoveTaskInput } from "@/lib/codex/projects"
import { listSectionTasks, moveTaskToSection } from "@/lib/codex/projectsRepo"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../../_gate"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string; sectionId: string }> }

/**
 * GET (B39): a page of this section's cards in board order, for "Load
 * more". `?offset=` (default 0), `?limit=` (1 to 200, default 50),
 * `?completed=hide|show` (default hide).
 */
export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const params = await context.params
  const id = parseId(params.id)
  const sectionId = parseId(params.sectionId)
  if (id == null || sectionId == null) return jsonError(404, "not_found")
  const search = new URL(request.url).searchParams
  const rawOffset = search.get("offset")
  const offset = rawOffset == null || rawOffset === "0" ? 0 : parseId(rawOffset)
  const rawLimit = search.get("limit")
  const limit = rawLimit == null ? undefined : parseId(rawLimit)
  const rawCompleted = search.get("completed")
  const hide = parseCompletedParam(rawCompleted)
  if (offset == null || limit === null || (rawCompleted != null && hide == null)) {
    return jsonError(400, "invalid_query", "offset and limit must be whole numbers; completed must be hide or show.")
  }
  try {
    const result = await listSectionTasks(id, sectionId, email, { hideCompleted: hide ?? true, offset, limit })
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ items: result.items, total: result.total })
  } catch (error) {
    return projectsErrorResponse(error, "section tasks")
  }
}

/**
 * POST `{ task_id, sort_order? | after_task_id? }`: move a task into this
 * section. Its status becomes the section's category; a done section
 * completes it. `after_task_id` places it right after that card (null:
 * first) and renumbers the section (the board's drag). A task in another
 * project is 409 other_project; an anchor no longer in the section is 409
 * anchor_not_in_section.
 */
export async function POST(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag
  if (!(await isCodexProjectsEnabled())) return jsonError(404, "not_found")
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const email = sessionEmail(auth.session)
  if (!email) return jsonError(401, "unauthorised")
  const params = await context.params
  const id = parseId(params.id)
  const sectionId = parseId(params.sectionId)
  if (id == null || sectionId == null) return jsonError(404, "not_found")
  const parsed = parseMoveTaskInput(await request.json().catch(() => null))
  if (!parsed.ok) return jsonError(400, parsed.error, parsed.message)
  try {
    const result = await moveTaskToSection(id, sectionId, email, parsed.value)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ task: result.task })
  } catch (error) {
    return projectsErrorResponse(error, "move task")
  }
}
