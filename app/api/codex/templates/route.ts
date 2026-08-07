import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/getCurrentUser"
import { createTemplate, listTemplates } from "@/lib/codex/repo"
import {
  codexFlagGuard,
  requireCodexInternalAccess,
  sessionEmail,
} from "../_shared"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const flag = codexFlagGuard()
  if (flag) return flag

  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return auth.error

  try {
    const url = new URL(request.url)
    const data = await listTemplates({
      includeItems: url.searchParams.get("include_items") === "1",
      page: Number(url.searchParams.get("page") || 1),
      perPage: Number(url.searchParams.get("per_page") || 100),
    })
    return NextResponse.json(data)
  } catch (error) {
    console.error("Failed to list templates:", error)
    return NextResponse.json(
      {
        error: "Failed to list templates",
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "bad_request", message: "Expected an object body." },
        { status: 400 }
      )
    }
    const raw = body as Record<string, unknown>
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    if (!name) {
      return NextResponse.json(
        { error: "bad_request", message: "name is required." },
        { status: 400 }
      )
    }

    const currentUser = await getCurrentUser(request)
    const actor = sessionEmail(auth.session, currentUser?.email)
    const template = await createTemplate(
      {
        name,
        description: typeof raw.description === "string" ? raw.description : null,
      },
      actor
    )
    if (!template) {
      return NextResponse.json(
        { error: "bad_request", message: "name is required." },
        { status: 400 }
      )
    }
    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error("Failed to create template:", error)
    return NextResponse.json(
      {
        error: "Failed to create template",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
