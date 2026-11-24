import { NextResponse } from "next/server"

import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { runBillingPartnerPackJob } from "@/lib/finance/billingPartner/packJob"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300
export const preferredRegion = ["syd1"]

/**
 * 06:00 UTC on the 17th: 17:00 Melbourne in AEDT and 16:00 in AEST, the
 * Melbourne 17th either way. Builds the AA draft pack (S15); sends nothing.
 */
export async function GET(request: Request) {
  if (!assertCronSecret(request)) {
    return NextResponse.json(
      { error: "unauthorised", hint: "cron_secret_required" },
      { status: 401 },
    )
  }

  try {
    return NextResponse.json(await runBillingPartnerPackJob())
  } catch (err) {
    const message = err instanceof Error ? err.message : "Billing partner pack job failed"
    console.error("[billing-partner-pack]", err)
    return NextResponse.json({ status: "error", message }, { status: 500 })
  }
}
