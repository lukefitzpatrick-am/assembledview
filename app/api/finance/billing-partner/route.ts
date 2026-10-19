import { NextRequest, NextResponse } from "next/server"

import {
  aaCycleDates,
  billingMonthLabel,
  defaultBillingMonth,
  normalizeBillingMonth,
  type BillingPartnerPagePayload,
} from "@/lib/finance/billingPartner/cycle"
import { listDueAaPlans } from "@/lib/finance/billingPartner/duePlans"
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"
import { listPacksForMonth } from "@/lib/finance/billingPartner/packStore"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  try {
    const raw = request.nextUrl.searchParams.get("month")
    const billingMonth = raw ? normalizeBillingMonth(raw) : defaultBillingMonth()
    const [due, packs] = await Promise.all([
      listDueAaPlans(billingMonth),
      listPacksForMonth(billingMonth),
    ])
    const payload: BillingPartnerPagePayload = {
      billingMonth,
      monthLabel: billingMonthLabel(billingMonth),
      cycleDates: aaCycleDates(billingMonth),
      due,
      packs,
    }
    return NextResponse.json(payload)
  } catch (error) {
    return packErrorResponse(error, "GET /api/finance/billing-partner")
  }
}

function packErrorResponse(error: unknown, label: string): NextResponse {
  if (error instanceof BillingPartnerPackError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error(label, error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}
