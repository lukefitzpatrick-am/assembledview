import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { codexClientExists } from "@/lib/codex/clientExists"
import { resolveAssigneeForWrite } from "@/lib/codex/assigneeWrite"
import { isFeatureOn } from "@/lib/features/server"
import { getTask, softDeleteTask, updateTask } from "@/lib/codex/repo"
import { normaliseRecurringRule } from "@/lib/codex/recurringRule"
import { PROJECT_FAILURE_STATUS } from "@/lib/codex/projectFailureStatus"
import { AssigneeNoAccessError, TaskJoinedProjectError } from "@/lib/codex/projects"
import { hasTaskDetailKeys, parseTaskDetailPatch, type TaskDetailPatch } from "@/lib/codex/taskDetail"
import {
  isTaskCategory,
  readEstimatedMinutes,
  validateTaskInput,
} from "@/lib/codex/types"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
  hiddenTaskGuard,
  writeFailureResponse,
} from "../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

const PATCH_ALLOWLIST = [
  "title",
  "description",
  "status",
  "priority",
  "assignee_email",
  "assignee_name",
  "due_date",
  "estimated_minutes",
  "mba_number",
  "category",
  "client_visible",
  "client_id",
  "template_id",
  "recurring_rule",
] as const

export async function GET(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden

  try {
    const { id: idRaw } = await context.params
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    const task = await getTask(id, undefined, sessionEmail(auth.session))
    if (!task) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json(task)
  } catch (error) {
    console.error("Failed to get codex task:", error)
    return NextResponse.json(
      {
        error: "Failed to load task",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden

  try {
    const { id: idRaw } = await context.params
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body." },
        { status: 400 }
      )
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "bad_request", message: "Expected an object body." },
        { status: 400 }
      )
    }

    const raw = body as Record<string, unknown>
    // codex_projects (B40): asap, start and due dates, task or milestone,
    // custom field values and assigned by. Off: those keys are ignored and
    // asap is refused, as before.
    const projectsOn = await isFeatureOn("codex_projects")
    let details: TaskDetailPatch = {}
    if (projectsOn && hasTaskDetailKeys(raw)) {
      const parsedDetails = parseTaskDetailPatch(raw)
      if (!parsedDetails.ok) {
        return NextResponse.json({ error: parsedDetails.error, message: parsedDetails.message }, { status: 400 })
      }
      details = parsedDetails.value
    }
    const issue = validateTaskInput({
      ...("title" in raw ? { title: raw.title } : {}),
      ...("status" in raw ? { status: raw.status } : {}),
      ...("priority" in raw ? { priority: raw.priority } : {}),
      ...("due_date" in raw ? { due_date: raw.due_date } : {}),
      ...("estimated_minutes" in raw
        ? { estimated_minutes: raw.estimated_minutes }
        : {}),
      ...("category" in raw ? { category: raw.category } : {}),
      ...("assignee_email" in raw ? { assignee_email: raw.assignee_email } : {}),
    }, { allowAsap: projectsOn })
    if (issue) {
      return NextResponse.json(
        { error: "invalid", field: issue.field, message: issue.message },
        { status: 400 }
      )
    }

    const patch: Parameters<typeof updateTask>[1] = {}
    for (const key of PATCH_ALLOWLIST) {
      if (!(key in raw)) continue
      const v = raw[key]
      switch (key) {
        case "title":
          if (typeof v === "string" && v.trim()) patch.title = v.trim()
          break
        case "description":
          patch.description = typeof v === "string" ? v : null
          break
        case "status":
          if (typeof v === "string") patch.status = v
          break
        case "priority":
          patch.priority = typeof v === "string" ? v : null
          break
        case "assignee_email":
          // Repo is the only normalisation point — pass the raw string through.
          patch.assigneeEmail = typeof v === "string" ? v : null
          break
        case "assignee_name":
          patch.assigneeName = typeof v === "string" ? v : null
          break
        case "due_date":
          patch.dueDate = typeof v === "string" ? v : null
          break
        case "estimated_minutes":
          patch.estimatedMinutes = readEstimatedMinutes(v) ?? null
          break
        case "mba_number":
          patch.mbaNumber = typeof v === "string" ? v : null
          break
        case "category":
          // No DB CHECK on tasks.category — enforce TASK_CATEGORIES in the app.
          if (v === null) {
            patch.category = null
          } else if (typeof v === "string") {
            if (!isTaskCategory(v)) {
              return NextResponse.json(
                {
                  error: "bad_request",
                  message:
                    "category must be one of: reporting, pacing, creative, finance, admin, meeting_followup, other.",
                },
                { status: 400 }
              )
            }
            patch.category = v
          }
          break
        case "client_visible":
          if (typeof v === "boolean") patch.clientVisible = v
          break
        case "client_id": {
          const clientIdNum = Number(v)
          if (!Number.isFinite(clientIdNum) || clientIdNum < 1) {
            return NextResponse.json(
              {
                error: "bad_request",
                message: "client_id must be a positive integer.",
              },
              { status: 400 }
            )
          }
          if (!(await codexClientExists(clientIdNum))) {
            return NextResponse.json(
              {
                error: "bad_request",
                message: `client_id ${clientIdNum} does not exist.`,
              },
              { status: 400 }
            )
          }
          patch.clientId = clientIdNum
          break
        }
        case "template_id": {
          if (v === null || v === "") {
            patch.templateId = null
          } else {
            const n = Number(v)
            if (!Number.isFinite(n) || n < 1) {
              return NextResponse.json(
                {
                  error: "bad_request",
                  message: "template_id must be a positive integer.",
                },
                { status: 400 }
              )
            }
            patch.templateId = n
          }
          break
        }
        case "recurring_rule": {
          if (v === null || v === "") {
            patch.recurringRule = null
          } else if (typeof v === "string") {
            const normalised = normaliseRecurringRule(v)
            if (!normalised) {
              return NextResponse.json(
                {
                  error: "bad_request",
                  message:
                    "recurring_rule must be monthly:<day>, weekly:<dow>, or monthly:lbd.",
                },
                { status: 400 }
              )
            }
            patch.recurringRule = normalised
          }
          break
        }
      }
    }

    // Alias to the person's main email; a shared address is refused (F16, switch).
    if (typeof patch.assigneeEmail === "string" && patch.assigneeEmail.trim()) {
      const assignee = await resolveAssigneeForWrite(patch.assigneeEmail, patch.assigneeName)
      if (!assignee.ok) return NextResponse.json(assignee.body, { status: assignee.status })
      patch.assigneeEmail = assignee.email
      if (assignee.resolved) patch.assigneeName = assignee.name
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    // Assigned by is the server's (never in the body): with the switch on, an
    // assignee change records who gave the task to someone else.
    if (projectsOn) patch.trackAssignedBy = true
    // codex_projects (B41): the task's state before the write, for follows and
    // (codex_notifications) notifications after it. Loaded only with the switch on.
    const notify = projectsOn ? await import("@/lib/codex/notify") : null
    const before = notify ? await notify.beforeTaskWrite([id]) : new Map()
    let task
    try {
      // codex_projects (B39, B40): a status change on a project task moves it to the
      // matching section, or is refused with nothing changed; the B40 detail keys,
      // asap and a due date change go through the same checked path.
      // The projects store loads only with the switch on, so the off path is the module as before.
      if (
        projectsOn &&
        (patch.status !== undefined || patch.priority === "asap" || patch.dueDate !== undefined || Object.keys(details).length > 0)
      ) {
        const { updateTaskThroughSections } = await import("@/lib/codex/projectsRepo")
        const outcome = await updateTaskThroughSections(id, patch, actor, undefined, details)
        if (!outcome.ok) {
          return NextResponse.json(
            { error: outcome.reason, message: outcome.message },
            { status: PROJECT_FAILURE_STATUS[outcome.reason] ?? 409 }
          )
        }
        task = outcome.task
      } else {
        task = await updateTask(id, patch, actor)
      }
    } catch (err) {
      // F5 (B42fix): a private project's task goes only to someone who can see the project.
      if (err instanceof AssigneeNoAccessError) {
        return NextResponse.json({ error: "assignee_no_access", message: err.message }, { status: 409 })
      }
      // R2 (PACK4fix): the task moved into a project while the assignment waited on it.
      if (err instanceof TaskJoinedProjectError) {
        return NextResponse.json({ error: "task_changed", message: err.message }, { status: 409 })
      }
      const msg = err instanceof Error ? err.message : String(err)
      if (/template_id .* does not exist/i.test(msg) || /Invalid recurring_rule/i.test(msg)) {
        return NextResponse.json(
          { error: "bad_request", message: msg },
          { status: 400 }
        )
      }
      throw err
    }
    if (!task) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    if (notify) await notify.afterTaskWrite(actor, before, [id])
    return NextResponse.json(task)
  } catch (error) {
    return writeFailureResponse(error, "Failed to patch codex task:", "Failed to update task")
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error
  const hidden = await hiddenTaskGuard(context, auth.session)
  if (hidden) return hidden

  try {
    const { id: idRaw } = await context.params
    const id = Number(idRaw)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "Task id is required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const ok = await softDeleteTask(id, actor)
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return writeFailureResponse(error, "Failed to delete codex task:", "Failed to delete task")
  }
}
