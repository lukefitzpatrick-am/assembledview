import { NextRequest, NextResponse } from "next/server"

import { generateCampaignReadDraft } from "@/lib/campaign-read/generate"
import { CampaignReadError } from "@/lib/campaign-read/repo"
import { CampaignReadValidationError } from "@/lib/campaign-read/beats"
import { requireAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    const n = Number(value)
    if (n > 0) return Math.floor(n)
  }
  return undefined
}

function actorEmail(session: { user?: { email?: string | null } } | null): string | null {
  const email = session?.user?.email
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    const status = auth.response.status === 401 ? 401 : 403
    return NextResponse.json(
      { error: status === 401 ? "unauthorised" : "forbidden" },
      { status },
    )
  }

  if (process.env.AVA_ENGINE === "off") {
    return NextResponse.json({ error: "ava_off" }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ava_unconfigured" }, { status: 503 })
  }

  const email = actorEmail(auth.session)
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const body = raw as Record<string, unknown>
  const mbaNumber = String(body.mbaNumber ?? body.mba ?? "").trim()
  const versionNumber = asNumber(body.versionNumber ?? body.version)
  if (!mbaNumber || versionNumber == null) {
    return NextResponse.json(
      { error: "mbaNumber and versionNumber are required" },
      { status: 400 },
    )
  }

  try {
    const item = await generateCampaignReadDraft({
      mbaNumber,
      versionNumber,
      generatedByEmail: email,
      userSub: typeof auth.session?.user?.sub === "string" ? auth.session.user.sub : undefined,
      clientSlug: typeof body.clientSlug === "string" ? body.clientSlug : undefined,
    })
    return NextResponse.json({ item }, { status: 201 })
  } catch (err) {
    if (err instanceof CampaignReadValidationError) {
      return NextResponse.json({ error: "validation", message: err.message }, { status: 422 })
    }
    if (err instanceof CampaignReadError) {
      const status = err.code === "UNAVAILABLE" ? 503 : err.code === "NOT_FOUND" ? 404 : 400
      return NextResponse.json({ error: err.code.toLowerCase(), message: err.message }, { status })
    }
    console.error("[api/campaign-reads/generate]", err)
    return NextResponse.json({ error: "generate_failed" }, { status: 502 })
  }
}
