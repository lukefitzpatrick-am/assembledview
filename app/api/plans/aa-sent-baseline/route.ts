import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { loadSentAaBaseline } from "@/lib/finance/billingPartner/sentAaBaseline"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"

export const dynamic = "force-dynamic"

/** Sent-pack AA billing media for the publish warning. Draft packs are omitted. */
export async function GET(request: NextRequest) {
  const mba = parseMbaNumber(new URL(request.url).searchParams.get("mba"))
  if (!mba) return invalidMbaNumberResponse()

  const access = await checkClientMbaAccess(request, mba)
  if (!access.ok) return access.response

  try {
    const sentPacks = await loadSentAaBaseline(mba)
    return NextResponse.json({ sentPacks })
  } catch (error) {
    console.error("[aa-sent-baseline]", error instanceof Error ? error.message : "failed")
    return NextResponse.json({ error: "Could not load sent AA months" }, { status: 500 })
  }
}
