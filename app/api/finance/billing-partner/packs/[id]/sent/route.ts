import { NextRequest, NextResponse } from "next/server"

import { financeActorEmail } from "@/lib/finance/billingPartner/cycle"
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"
import { markPackSent } from "@/lib/finance/billingPartner/packStore"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const sentBy = financeActorEmail(gate.session?.user?.email)
  if (!sentBy) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  try {
    const { id } = await context.params
    if (!PACK_ID.test(id)) {
      throw new BillingPartnerPackError("Pack id is not valid", 400)
    }
    const row = await markPackSent({ packId: id, sentBy })
    return NextResponse.json(row)
  } catch (error) {
    if (error instanceof BillingPartnerPackError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("POST /api/finance/billing-partner/packs/[id]/sent", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
