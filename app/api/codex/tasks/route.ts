import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { codexClientExists } from "@/lib/codex/clientExists"
import {
  parseTaskSort,
  resolveListAssigneeScope,
} from "@/lib/codex/queryHelpers"
import {
  createTask,
  listTasks,
  parseStatusFilter,
  type ListTasksFilters,
} from "@/lib/codex/repo"
import { normaliseRecurringRule } from "@/lib/codex/recurringRule"
import { readEstimatedMinutes, validateTaskInput } from "@/lib/codex/types"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../_shared"

export const runtime = "nodejs"

function parseTaskSearch(raw: string | null): string | undefined {
  if (raw == null) return undefined
  const q = raw.trim().slice(0, 100)
  return q.length > 0 ? q : undefined
}

export type ParsedTaskListFilters =
  | { ok: true; filters: ListTasksFilters }
  | { ok: false; error: NextResponse }

/** Shared by GET /api/codex/tasks and GET /api/codex/tasks/status-counts. */
export async function parseTaskListFilters(
  request: Request
): Promise<ParsedTaskListFilters> {
  const url = new URL(request.url)
  const mineRaw = url.searchParams.get("mine")
  const mine = mineRaw === "1" || mineRaw === "true" || mineRaw === "yes"

  let sessionEmailForMine: string | null = null
  if (mine) {
    const currentUser = await getCurrentUser(request)
    sessionEmailForMine = currentUser?.email?.trim() || null
    if (!sessionEmailForMine) {
      return {
        ok: false,
        error: NextResponse.json(
          {
            error: "no_user",
            message: "Could not resolve session email for mine=1.",
          },
          { status: 401 }
        ),
      }
    }
  }
  // Never trust a client-supplied assignee_email when mine is set.
  const assigneeScope = resolveListAssigneeScope({
    mine,
    sessionEmail: sessionEmailForMine,
    queryAssigneeEmail: url.searchParams.get("assignee_email"),
  })

  const clientIdRaw = url.searchParams.get("client_id")
  const noClient = url.searchParams.get("no_client") === "1"
  const clientId =
    noClient || clientIdRaw == null || clientIdRaw === ""
      ? undefined
      : Number(clientIdRaw)
  const unassigned = url.searchParams.get("unassigned") === "1"

  return {
    ok: true,
    filters: {
      clientId:
        clientId != null && Number.isFinite(clientId) ? clientId : undefined,
      noClient,
      unassigned,
      mineForEmail: unassigned ? undefined : assigneeScope.mineForEmail,
      assigneeEmail: unassigned ? undefined : assigneeScope.assigneeEmail,
      createdByEmail: url.searchParams.get("created_by") || undefined,
      status: parseStatusFilter(url.searchParams.get("status")),
      mbaNumber: url.searchParams.get("mba_number") || undefined,
      dueBefore: url.searchParams.get("due_before") || undefined,
      dueAfter: url.searchParams.get("due_after") || undefined,
      overdue: url.searchParams.get("overdue") === "1",
      category: url.searchParams.get("category") || undefined,
      priority: url.searchParams.get("priority") || undefined,
      source: url.searchParams.get("source") || undefined,
      autoCreated: url.searchParams.get("auto_created") === "1" ? true : undefined,
      q: parseTaskSearch(url.searchParams.get("q")),
      includeDeleted: url.searchParams.get("include_deleted") === "1",
      sort: parseTaskSort(url.searchParams.get("sort")),
      page: Number(url.searchParams.get("page") || 1),
      perPage: Number(url.searchParams.get("per_page") || 50),
    },
  }
}

export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const parsed = await parseTaskListFilters(request)
    if (!parsed.ok) return parsed.error

    const data = await listTasks(parsed.filters)

    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to fetch codex tasks:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch tasks",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
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
      return NextResponse.json(
        { error: "bad_request", message: "Invalid JSON body." },
        { status: 400 }
      )
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "bad_request", message: "Expected an object body." },
        { status: 400 }
      )
    }

    const raw = body as Record<string, unknown>
    const issue = validateTaskInput({
      title: raw.title,
      ...("status" in raw ? { status: raw.status } : {}),
      ...("priority" in raw ? { priority: raw.priority } : {}),
      ...("due_date" in raw ? { due_date: raw.due_date } : {}),
      ...("estimated_minutes" in raw
        ? { estimated_minutes: raw.estimated_minutes }
        : {}),
      ...("category" in raw ? { category: raw.category } : {}),
      ...("assignee_email" in raw ? { assignee_email: raw.assignee_email } : {}),
    })
    if (issue) {
      return NextResponse.json(
        { error: "invalid", field: issue.field, message: issue.message },
        { status: 400 }
      )
    }

    const title = (raw.title as string).trim()
    const clientId = raw.client_id
    if (
      clientId === undefined ||
      clientId === null ||
      clientId === "" ||
      (typeof clientId === "number" && !Number.isFinite(clientId))
    ) {
      return NextResponse.json(
        { error: "bad_request", message: "client_id is required." },
        { status: 400 }
      )
    }

    const clientIdNum = Number(clientId)
    if (!Number.isFinite(clientIdNum) || clientIdNum < 1) {
      return NextResponse.json(
        { error: "bad_request", message: "client_id must be a positive integer." },
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

    const currentUser = await getCurrentUser(request)
    const createdByEmail = sessionEmail(auth.session, currentUser?.email)
    if (!createdByEmail) {
      return NextResponse.json(
        { error: "no_user", message: "Could not resolve session email." },
        { status: 401 }
      )
    }

    const category =
      raw.category === null || raw.category === undefined
        ? null
        : (raw.category as string)

    let templateId: number | null = null
    if (raw.template_id !== undefined && raw.template_id !== null && raw.template_id !== "") {
      const n = Number(raw.template_id)
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          {
            error: "bad_request",
            message: "template_id must be a positive integer.",
          },
          { status: 400 }
        )
      }
      templateId = n
    }

    let recurringRule: string | null = null
    if (typeof raw.recurring_rule === "string" && raw.recurring_rule.trim()) {
      recurringRule = normaliseRecurringRule(raw.recurring_rule)
      if (!recurringRule) {
        return NextResponse.json(
          {
            error: "bad_request",
            message:
              "recurring_rule must be monthly:<day>, weekly:<dow>, or monthly:lbd.",
          },
          { status: 400 }
        )
      }
    }

    if (recurringRule && !templateId) {
      return NextResponse.json(
        {
          error: "bad_request",
          message: "recurring_rule requires template_id (series seed).",
        },
        { status: 400 }
      )
    }

    let task
    try {
      task = await createTask(
        {
          title,
          clientId: clientIdNum,
          description:
            typeof raw.description === "string" ? raw.description : null,
          status: "status" in raw ? (raw.status as string) : null,
          priority:
            "priority" in raw ? (raw.priority as string | null) : null,
          assigneeEmail:
            "assignee_email" in raw
              ? (raw.assignee_email as string | null)
              : null,
          assigneeName:
            typeof raw.assignee_name === "string" ? raw.assignee_name : null,
          dueDate: "due_date" in raw ? (raw.due_date as string | null) : null,
          estimatedMinutes:
            "estimated_minutes" in raw
              ? readEstimatedMinutes(raw.estimated_minutes) ?? null
              : null,
          mbaNumber: typeof raw.mba_number === "string" ? raw.mba_number : null,
          category,
          clientVisible:
            typeof raw.client_visible === "boolean" ? raw.client_visible : null,
          templateId,
          recurringRule,
          createdByEmail,
        },
        createdByEmail
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/template_id .* does not exist/i.test(msg) || /Invalid recurring_rule/i.test(msg)) {
        return NextResponse.json(
          { error: "bad_request", message: msg },
          { status: 400 }
        )
      }
      throw err
    }

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error("Failed to create codex task:", error)
    return NextResponse.json(
      {
        error: "Failed to create task",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
