import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { codexClientExists } from "@/lib/codex/clientExists"
import { resolveListAssigneeScope } from "@/lib/codex/queryHelpers"
import {
  createTask,
  listTasks,
  parseStatusFilter,
  type TaskSort,
} from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../_shared"

export const runtime = "nodejs"

function parseSort(raw: string | null): TaskSort | undefined {
  if (raw === "due_date_asc" || raw === "due_date_desc" || raw === "created_at_desc") {
    return raw
  }
  return undefined
}

export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const mineRaw = url.searchParams.get("mine")
    const mine =
      mineRaw === "1" || mineRaw === "true" || mineRaw === "yes"

    let sessionEmailForMine: string | null = null
    if (mine) {
      const currentUser = await getCurrentUser(request)
      sessionEmailForMine = currentUser?.email?.trim() || null
      if (!sessionEmailForMine) {
        return NextResponse.json(
          {
            error: "no_user",
            message: "Could not resolve session email for mine=1.",
          },
          { status: 401 }
        )
      }
    }
    // Never trust a client-supplied assignee_email when mine is set.
    const assigneeScope = resolveListAssigneeScope({
      mine,
      sessionEmail: sessionEmailForMine,
      queryAssigneeEmail: url.searchParams.get("assignee_email"),
    })

    const clientIdRaw = url.searchParams.get("client_id")
    const clientId =
      clientIdRaw != null && clientIdRaw !== ""
        ? Number(clientIdRaw)
        : undefined

    const data = await listTasks({
      clientId:
        clientId != null && Number.isFinite(clientId) ? clientId : undefined,
      mineForEmail: assigneeScope.mineForEmail,
      assigneeEmail: assigneeScope.assigneeEmail,
      status: parseStatusFilter(url.searchParams.get("status")),
      mbaNumber: url.searchParams.get("mba_number") || undefined,
      dueBefore: url.searchParams.get("due_before") || undefined,
      dueAfter: url.searchParams.get("due_after") || undefined,
      category: url.searchParams.get("category") || undefined,
      source: url.searchParams.get("source") || undefined,
      includeDeleted: url.searchParams.get("include_deleted") === "1",
      sort: parseSort(url.searchParams.get("sort")),
      page: Number(url.searchParams.get("page") || 1),
      perPage: Number(url.searchParams.get("per_page") || 50),
    })

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
    const title = typeof raw.title === "string" ? raw.title.trim() : ""
    const clientId = raw.client_id

    if (!title) {
      return NextResponse.json(
        { error: "bad_request", message: "title is required." },
        { status: 400 }
      )
    }
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

    const task = await createTask(
      {
        title,
        clientId: clientIdNum,
        description:
          typeof raw.description === "string" ? raw.description : null,
        status: typeof raw.status === "string" ? raw.status : null,
        priority: typeof raw.priority === "string" ? raw.priority : null,
        assigneeEmail:
          typeof raw.assignee_email === "string" ? raw.assignee_email : null,
        assigneeName:
          typeof raw.assignee_name === "string" ? raw.assignee_name : null,
        dueDate: typeof raw.due_date === "string" ? raw.due_date : null,
        mbaNumber: typeof raw.mba_number === "string" ? raw.mba_number : null,
        category: typeof raw.category === "string" ? raw.category : null,
        clientVisible:
          typeof raw.client_visible === "boolean" ? raw.client_visible : null,
        createdByEmail,
      },
      createdByEmail
    )

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
