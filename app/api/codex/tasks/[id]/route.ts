import { NextResponse } from "next/server"
import { getCodexBaseUrl } from "@/lib/api/codex"
import {
  axiosErrorResponse,
  codexApiClient,
  requireCodexInternalAccess,
  retryApiCall,
  withOverallTimeout,
} from "../../_shared"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const { id } = await context.params
    if (!id?.trim()) {
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

    const response = await withOverallTimeout(
      retryApiCall(() =>
        codexApiClient.patch(
          `${getCodexBaseUrl()}/tasks/${encodeURIComponent(id)}`,
          body
        )
      )
    )

    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to patch codex task:", error)
    return axiosErrorResponse(error, "Failed to update task")
  }
}
