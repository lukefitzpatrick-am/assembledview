import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import {
  CodexBulkError,
  bulkSoftDeleteTasks,
  bulkUpdateTasks,
  type UpdateTaskInput,
} from "@/lib/codex/repo"
import { validateTaskInput } from "@/lib/codex/types"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
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
  const flag = codexFlagGuard()
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

    if (isDelete) {
      const deleted = await bulkSoftDeleteTasks(ids, actor)
      return NextResponse.json({ ids: deleted })
    }

    const parsed = parseBulkPatch(raw.patch)
    if (!parsed.ok) return parsed.error
    const tasks = await bulkUpdateTasks(ids, parsed.patch, actor)
    return NextResponse.json({ tasks })
  } catch (error) {
    if (error instanceof CodexBulkError) {
      const status = error.statusCode
      return NextResponse.json(
        {
          error: status === 409 ? "conflict" : "bad_request",
          message: error.message,
          id: error.taskId,
        },
        { status }
      )
    }
    console.error("Failed to bulk-update codex tasks:", error)
    return NextResponse.json(
      {
        error: "Failed to update tasks",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
