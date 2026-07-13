import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { getCodexBaseUrl } from "@/lib/api/codex"
import {
  axiosErrorResponse,
  codexApiClient,
  requireCodexInternalAccess,
  retryApiCall,
  withOverallTimeout,
} from "../_shared"

export const runtime = "nodejs"

const FORWARD_QUERY_KEYS = [
  "page",
  "per_page",
  "client_id",
  "assignee_email",
  "status",
  "mba_number",
  "due_before",
  "due_after",
  "sort",
] as const

function capPerPage(raw: string | null): string | null {
  if (raw == null || raw === "") return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return "1"
  return String(Math.min(Math.floor(n), 100))
}

export async function GET(request: Request) {
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const upstream = new URL(`${getCodexBaseUrl()}/tasks`)

    for (const key of FORWARD_QUERY_KEYS) {
      const value = url.searchParams.get(key)
      if (value == null || value === "") continue
      if (key === "per_page") {
        const capped = capPerPage(value)
        if (capped) upstream.searchParams.set(key, capped)
        continue
      }
      upstream.searchParams.set(key, value)
    }

    const mineRaw = url.searchParams.get("mine")
    const mine =
      mineRaw === "1" || mineRaw === "true" || mineRaw === "yes"
    if (mine) {
      const currentUser = await getCurrentUser(request)
      const email = currentUser?.email?.trim()
      if (!email) {
        return NextResponse.json(
          {
            error: "no_user",
            message: "Could not resolve session email for mine=1.",
          },
          { status: 401 }
        )
      }
      // Never trust a client-supplied assignee_email when mine is set.
      upstream.searchParams.set("assignee_email", email)
    }

    const response = await withOverallTimeout(
      retryApiCall(() => codexApiClient.get(upstream.toString()))
    )

    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch codex tasks:", error)
    return axiosErrorResponse(error, "Failed to fetch tasks")
  }
}

export async function POST(request: Request) {
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
    const title =
      typeof raw.title === "string" ? raw.title.trim() : ""
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

    const currentUser = await getCurrentUser(request)
    const createdBy =
      currentUser?.email?.trim() ||
      (typeof auth.session.user?.email === "string"
        ? auth.session.user.email.trim()
        : "") ||
      null

    const payload = {
      ...raw,
      title,
      client_id: clientId,
      created_by: createdBy,
    }

    const response = await withOverallTimeout(
      retryApiCall(() =>
        codexApiClient.post(`${getCodexBaseUrl()}/tasks`, payload)
      )
    )

    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create codex task:", error)
    return axiosErrorResponse(error, "Failed to create task")
  }
}
