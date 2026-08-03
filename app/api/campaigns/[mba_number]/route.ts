import { NextRequest, NextResponse } from "next/server"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"

/**
 * GET /api/campaigns/[mba_number] — retired (X3 / X-AUDIT-1 RETIRE(dead)).
 * Zero in-repo fetch callers; use GET /api/mediaplans/mba/[mba_number].
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  const { mba_number: rawMbaNumber } = await params
  const mba_number = parseMbaNumber(rawMbaNumber)
  if (!mba_number) return invalidMbaNumberResponse()

  const access = await checkClientMbaAccess(request, mba_number)
  if (!access.ok) return access.response

  return NextResponse.json(
    {
      error:
        "GET /api/campaigns/[mba_number] is retired (X3). Use /api/mediaplans/mba/[mba_number].",
      code: "CAMPAIGNS_MBA_GONE",
    },
    { status: 410 }
  )
}
