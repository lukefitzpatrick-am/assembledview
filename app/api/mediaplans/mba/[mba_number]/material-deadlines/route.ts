import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"
import { requireRole } from "@/lib/requireRole"
import {
  deriveMaterialDeadlines,
  recordDeadlineOverride,
} from "@/lib/specs/deriveMaterialDeadlines"
import {
  loadDeadlineOverrides,
  upsertDeadlineOverride,
} from "@/lib/specs/deadlineOverrides"
import { loadPublishedPlanDeadlineLines } from "@/lib/specs/planDeadlineLines"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function emailOf(session: { user?: { email?: string | null } } | null | undefined): string {
  return (session?.user?.email ?? "").trim().toLowerCase()
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mba_number: string }> },
) {
  const { mba_number: raw } = await context.params
  const mbaNumber = parseMbaNumber(raw)
  if (!mbaNumber) return invalidMbaNumberResponse()

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response

  const [lines, overrides] = await Promise.all([
    loadPublishedPlanDeadlineLines(mbaNumber),
    loadDeadlineOverrides(mbaNumber),
  ])
  const derived = deriveMaterialDeadlines({
    lines,
    overrides,
    asOfYmd: sydneyCivilParts().ymd,
  })
  return NextResponse.json({
    items: derived.stripItems,
    coverText: derived.coverText,
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ mba_number: string }> },
) {
  const gate = await requireRole(request, "admin")
  if ("response" in gate) return gate.response

  const { mba_number: raw } = await context.params
  const mbaNumber = parseMbaNumber(raw)
  if (!mbaNumber) return invalidMbaNumberResponse()

  const access = await checkClientMbaAccess(request, mbaNumber)
  if (!access.ok) return access.response

  const body = (await request.json().catch(() => null)) as {
    publisherKey?: unknown
    derivedYmd?: unknown
    overrideYmd?: unknown
  } | null
  const publisherKey = typeof body?.publisherKey === "string" ? body.publisherKey.trim() : ""
  const derivedYmd = typeof body?.derivedYmd === "string" ? body.derivedYmd.trim() : ""
  const overrideYmd = typeof body?.overrideYmd === "string" ? body.overrideYmd.trim() : ""
  if (
    !publisherKey
    || !/^\d{4}-\d{2}-\d{2}$/.test(derivedYmd)
    || !/^\d{4}-\d{2}-\d{2}$/.test(overrideYmd)
  ) {
    return NextResponse.json({ error: "invalid_override" }, { status: 400 })
  }

  const overriddenBy = emailOf(gate.session)
  if (!overriddenBy) {
    return NextResponse.json({ error: "invalid_override" }, { status: 400 })
  }

  const existing = await loadDeadlineOverrides(mbaNumber)
  const next = recordDeadlineOverride(existing, {
    publisherKey,
    derivedYmd,
    overrideYmd,
    overriddenBy,
    overriddenAt: new Date().toISOString(),
  }).find((row) => row.publisherKey === publisherKey)
  if (!next) {
    return NextResponse.json({ error: "invalid_override" }, { status: 400 })
  }
  await upsertDeadlineOverride(mbaNumber, next)
  return NextResponse.json({ ok: true, override: next })
}
