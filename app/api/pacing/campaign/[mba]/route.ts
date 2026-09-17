import { NextRequest, NextResponse } from "next/server"

import { createCampaignInsight, WriteInsightError } from "@/lib/insights/writeCampaignInsights"
import { requirePacingAccess } from "@/lib/pacing/pacingAuth"
import {
  buildCampaignDetail,
  CampaignDetailError,
} from "@/lib/pacing/detail/buildCampaignDetail"
import { getAsOfDate } from "@/lib/pacing/maths"
import { resolveClientSlugs } from "@/lib/pacing/scope/resolveClientSlugs"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function actorEmail(session: { user?: { email?: string | null } }): string | null {
  const email = session.user?.email
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mba: string }> },
) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const { mba } = await context.params
  const asOf = request.nextUrl.searchParams.get("asOfDate")?.trim() || getAsOfDate()
  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds))

  try {
    const payload = await buildCampaignDetail({
      mbaNumber: decodeURIComponent(mba),
      asOfDate: asOf,
      allowedClientSlugs,
    })
    return NextResponse.json(payload)
  } catch (err) {
    if (err instanceof CampaignDetailError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error("[api/pacing/campaign] GET failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ mba: string }> },
) {
  const gate = await requirePacingAccess(request)
  if (!gate.ok) return gate.response

  const email = actorEmail(gate.session)
  if (!email) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  const { mba } = await context.params
  const mbaNumber = decodeURIComponent(mba).trim()
  const allowedClientSlugs =
    gate.allowedClientIds === null
      ? null
      : new Set(await resolveClientSlugs(gate.allowedClientIds))

  try {
    await buildCampaignDetail({
      mbaNumber,
      allowedClientSlugs,
    })
  } catch (err) {
    if (err instanceof CampaignDetailError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }

  const json = (await request.json().catch(() => null)) as { body?: unknown } | null
  const body = typeof json?.body === "string" ? json.body.trim() : ""
  if (!body) {
    return NextResponse.json({ error: "body is required" }, { status: 400 })
  }

  try {
    const row = await createCampaignInsight({
      mbaNumber,
      body,
      insightType: "delivery",
      createdBy: email,
    })
    return NextResponse.json({ note: row }, { status: 201 })
  } catch (err) {
    if (err instanceof WriteInsightError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error("[api/pacing/campaign] POST note failed", err)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
