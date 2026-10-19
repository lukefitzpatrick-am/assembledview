import { NextRequest, NextResponse } from "next/server"

import { buildBillingPartnerPack } from "@/lib/finance/billingPartner/buildPack"
import { financeActorEmail } from "@/lib/finance/billingPartner/cycle"
import { BillingPartnerPackError } from "@/lib/finance/billingPartner/errors"
import { requireFinanceAdmin } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const gate = await requireFinanceAdmin(request)
  if ("response" in gate) return gate.response

  const createdBy = financeActorEmail(gate.session?.user?.email)
  if (!createdBy) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { billingMonth?: unknown; versionIds?: unknown }
    if (typeof body.billingMonth !== "string" || !body.billingMonth.trim()) {
      throw new BillingPartnerPackError("billingMonth is required", 400)
    }
    const versionIds = parseVersionIds(body.versionIds)
    const pack = await buildBillingPartnerPack({
      billingMonth: body.billingMonth,
      versionIds,
      createdBy,
    })
    const filename = pack.fileName.replace(/"/g, "")
    return new NextResponse(new Uint8Array(pack.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Billing-Partner-Pack-Id": pack.packId,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof BillingPartnerPackError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("POST /api/finance/billing-partner/packs", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function parseVersionIds(raw: unknown): number[] | undefined {
  if (raw == null) return undefined
  if (!Array.isArray(raw)) {
    throw new BillingPartnerPackError("versionIds must be a list of version ids", 400)
  }
  const ids: number[] = []
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new BillingPartnerPackError("versionIds must be a list of version ids", 400)
    }
    ids.push(value)
  }
  return ids
}
