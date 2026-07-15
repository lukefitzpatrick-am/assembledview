import { NextRequest, NextResponse } from "next/server"
import { auth0 } from "@/lib/auth0"
import { getUserRoles } from "@/lib/rbac"
import { processPlanAutopopulate } from "@/lib/ava/autopopulate/processPlanAutopopulate"
import { checkProcessPlanRateLimit } from "@/lib/ava/autopopulate/rateLimit"
import type { AutopopulateChannel } from "@/lib/ava/autopopulate/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

function parseChannel(raw: FormDataEntryValue | null): AutopopulateChannel | null {
  if (typeof raw !== "string") return null
  const v = raw.trim().toLowerCase()
  if (v === "radio" || v === "ooh") return v
  return null
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth0.getSession(req)
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const roles = getUserRoles(session.user)
    if (!roles.includes("admin")) {
      return NextResponse.json(
        { error: "AVA plan import is available to Admin users only." },
        { status: 403 },
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error:
            "ANTHROPIC_API_KEY is not configured. Ask an admin to set it in the deployment environment.",
        },
        { status: 503 },
      )
    }

    const sessionKey =
      typeof (session.user as { sub?: string }).sub === "string"
        ? (session.user as { sub: string }).sub
        : "anon"
    const limit = checkProcessPlanRateLimit(sessionKey)
    if (!limit.ok) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 })
    }

    const formData = await req.formData()
    const channel = parseChannel(formData.get("channel"))
    if (!channel) {
      return NextResponse.json(
        { error: 'Missing or invalid "channel" (radio | ooh).' },
        { status: 400 },
      )
    }

    const fileEntries: File[] = []
    for (const key of ["file", "files"]) {
      for (const entry of formData.getAll(key)) {
        if (entry instanceof File) fileEntries.push(entry)
      }
    }
    if (fileEntries.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 })
    }

    // P1: one workbook per request
    const file = fileEntries[0]
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await processPlanAutopopulate({
      buffer,
      fileName: file.name || "plan.xlsx",
      channel,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("processPlan API error", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
