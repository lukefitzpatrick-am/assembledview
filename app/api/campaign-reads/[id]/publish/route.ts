import { NextRequest, NextResponse } from "next/server"

import { CampaignReadError, publishCampaignRead } from "@/lib/campaign-read/repo"
import { requireAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"

function actorEmail(session: { user?: { email?: string | null } } | null): string | null {
  const email = session?.user?.email
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    const status = auth.response.status === 401 ? 401 : 403
    return NextResponse.json(
      { error: status === 401 ? "unauthorised" : "forbidden" },
      { status },
    )
  }
  const email = actorEmail(auth.session)
  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 })
  }

  const { id: rawId } = await context.params
  const id = Number(rawId)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 })
  }

  try {
    const item = await publishCampaignRead({ id, actorEmail: email })
    return NextResponse.json({ item })
  } catch (err) {
    if (err instanceof CampaignReadError) {
      const status = err.code === "NOT_FOUND" ? 404 : 400
      return NextResponse.json({ error: err.code.toLowerCase(), message: err.message }, { status })
    }
    console.error("[api/campaign-reads/:id/publish]", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
