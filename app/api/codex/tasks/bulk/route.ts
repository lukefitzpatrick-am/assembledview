import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  CodexBulkError,
  bulkSoftDeleteTasks,
  bulkUpdateTasks,
  type UpdateTaskInput,
} from "@/lib/codex/repo"
import { validateTaskInput } from "@/lib/codex/types"
import { resolveAssigneeForWrite } from "@/lib/codex/assigneeWrite"
import { isCodexProjectsEnabled } from "@/lib/codex/flag"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
  firstHiddenTaskId,
  writeFailureResponse,
} from "../../_shared"

export const runtime = "nodejs"

function badRequest(message: string, id?: number) {
  return NextResponse.json(
    { error: "bad_request", message, ...(id != null ? { id } : {}) },
    { status: 400 }
  )
}

function parseIds(raw: unknown): number[] | NextResponse {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 200) {
    return badRequest("ids must contain 1 to 200 tasks.")
  }
  const ids: number[] = []
  const seen = new Set<number>()
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return badRequest("ids must be positive integers.")
    }
    if (seen.has(value)) {
      return badRequest(`Duplicate id ${value}.`, value)
    }
    seen.add(value)
    ids.push(value)
  }
  return ids
}

/**
 * Same field rules as PATCH /api/codex/tasks/[id] for the bulk allowlist.
 * Returns a response when the patch is invalid.
 */
function parseBulkPatch(
  raw: unknown
): { ok: true; patch: UpdateTaskInput } | { ok: false; error: NextResponse } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: badRequest("patch must be an object.") }
  }
  const body = raw as Record<string, unknown>
  const issue = validateTaskInput({
    ...("status" in body ? { status: body.status } : {}),
    ...("priority" in body ? { priority: body.priority } : {}),
    ...("assignee_email" in body ? { assignee_email: body.assignee_email } : {}),
    ...("due_date" in body ? { due_date: body.due_date } : {}),
    ...("category" in body ? { category: body.category } : {}),
  })
  if (issue) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "invalid", field: issue.field, message: issue.message },
        { status: 400 }
      ),
    }
  }

  const patch: UpdateTaskInput = {}
  let fields = 0

  if ("status" in body) {
    patch.status = body.status as string
    fields += 1
  }

  if ("priority" in body) {
    patch.priority = body.priority as string | null
    fields += 1
  }

  if ("assignee_email" in body) {
    const value = body.assignee_email
    patch.assigneeEmail = typeof value === "string" ? value : null
    fields += 1
  }

  if ("assignee_name" in body) {
    const value = body.assignee_name
    if (value !== null && typeof value !== "string") {
      return {
        ok: false,
        error: badRequest("assignee_name must be a string or null."),
      }
    }
    patch.assigneeName = typeof value === "string" ? value : null
    fields += 1
  }

  if ("due_date" in body) {
    patch.dueDate = body.due_date as string | null
    fields += 1
  }

  if ("category" in body) {
    patch.category = body.category as string | null
    fields += 1
  }

  if (fields === 0) {
    return { ok: false, error: badRequest("patch must include a field to update.") }
  }
  return { ok: true, patch }
}

export async function POST(request: Request) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest("Invalid JSON body.")
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("Expected an object body.")
    }
    const raw = body as Record<string, unknown>
    const ids = parseIds(raw.ids)
    if (!Array.isArray(ids)) return ids

    const action = raw.action
    if (action != null && action !== "delete") {
      return badRequest('action must be "delete".')
    }
    const isDelete = action === "delete"
    const hasPatch = raw.patch != null
    if (isDelete && hasPatch) {
      return badRequest("Send either a patch or action delete, not both.")
    }
    if (!isDelete && !hasPatch) {
      return badRequest("patch is required unless action is delete.")
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)

    // B42 (C-211): a task in a private project the viewer cannot see is
    // answered exactly as a missing one (the whole batch is refused).
    const hiddenId = await firstHiddenTaskId(ids, auth.session)
    if (hiddenId != null) {
      return NextResponse.json(
        { error: "conflict", message: `Task ${hiddenId} was not found.`, id: hiddenId },
        { status: 409 }
      )
    }

    if (isDelete) {
      const deleted = await bulkSoftDeleteTasks(ids, actor)
      return NextResponse.json({ ids: deleted })
    }

    const parsed = parseBulkPatch(raw.patch)
    if (!parsed.ok) return parsed.error
    const patch = parsed.patch
    // Alias to the person's main email; a shared address is refused (F16, switch).
    if (typeof patch.assigneeEmail === "string" && patch.assigneeEmail.trim()) {
      const assignee = await resolveAssigneeForWrite(patch.assigneeEmail, patch.assigneeName)
      if (!assignee.ok) return NextResponse.json(assignee.body, { status: assignee.status })
      patch.assigneeEmail = assignee.email
      if (assignee.resolved) patch.assigneeName = assignee.name
    }
    // codex_projects (B40): assignee changes record who assigned (server side).
    const projectsOn = await isCodexProjectsEnabled()
    if (projectsOn) patch.trackAssignedBy = true
    // codex_projects (B41): the states before the write, for follows and
    // (codex_notifications) notifications after it. Loaded only with the switch on.
    const notify = projectsOn ? await import("@/lib/codex/notify") : null
    const before = notify ? await notify.beforeTaskWrite(ids) : new Map()
    // codex_projects (B39): a status change moves project tasks by section; one
    // refused task is 409 and the whole batch is rolled back.
    // The projects store loads only with the switch on.
    const throughSections =
      (patch.status !== undefined || patch.dueDate !== undefined) && (await isCodexProjectsEnabled())
        ? await (await import("@/lib/codex/projectsRepo")).bulkUpdateTasksThroughSections(ids, patch, actor)
        : null
    const tasks = throughSections ?? (await bulkUpdateTasks(ids, patch, actor))
    if (notify) await notify.afterTaskWrite(actor, before, ids)
    return NextResponse.json({ tasks })
  } catch (error) {
    if (error instanceof CodexBulkError) {
      const status = error.statusCode
      return NextResponse.json(
        {
          error: error.code ?? (status === 409 ? "conflict" : "bad_request"),
          message: error.message,
          id: error.taskId,
        },
        { status }
      )
    }
    return writeFailureResponse(error, "Failed to bulk-update codex tasks:", "Failed to update tasks")
  }
}
