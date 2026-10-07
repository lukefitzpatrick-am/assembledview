import { NextRequest, NextResponse } from "next/server"
import { servePlanFileAttachment } from "@/lib/docs/servePlanFile"
import { parseSingleBillingMonthParam } from "@/lib/finance/billingApiParams"
import { resolveRelevantVersionAaMediaPlan } from "@/lib/finance/resolveRelevantVersionAaMediaPlan"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const mbaRaw = request.nextUrl.searchParams.get("mba_number")
  const monthParsed = parseSingleBillingMonthParam(request.nextUrl.searchParams.get("billing_month"), {
    defaultWhenMissing: false,
  })

  if (!("ok" in monthParsed && monthParsed.ok)) {
    return NextResponse.json(monthParsed, { status: 400 })
  }

  const resolved = await resolveRelevantVersionAaMediaPlan(monthParsed.month, mbaRaw || "")
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, ...(resolved.field ? { field: resolved.field } : {}) },
      { status: resolved.status }
    )
  }

  return servePlanFileAttachment(resolved.file)
}
