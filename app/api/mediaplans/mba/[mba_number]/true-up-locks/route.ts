import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { loadTrueUpLocks } from "@/lib/finance/trueUp/locks"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Applied true-up schedule fixes for an MBA (component and months), for the
 * editors' full billing reset guard (C-157). Empty before migration 0109.
 * Tenant: checkClientMbaAccess. The save and override routes enforce the same
 * block on the server.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> },
) {
  try {
    const { mba_number: rawMbaNumber } = await params
    const mba_number = parseMbaNumber(rawMbaNumber)
    if (!mba_number) return invalidMbaNumberResponse()

    const access = await checkClientMbaAccess(request, mba_number)
    if (!access.ok) return access.response

    const locks = await loadTrueUpLocks(mba_number)
    return NextResponse.json({ locks })
  } catch (error) {
    console.error("[api/mediaplans/mba/[mba_number]/true-up-locks GET]", error)
    return NextResponse.json({ error: "Failed to load true-up locks" }, { status: 500 })
  }
}
