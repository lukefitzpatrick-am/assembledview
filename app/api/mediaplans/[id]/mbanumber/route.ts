import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"

/**
 * POST /api/mediaplans/[id]/mbanumber — retired (X3).
 * X-AUDIT-1: zero in-repo fetch callers; minting uses GET /api/mediaplans/mbanumber.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  await params
  return NextResponse.json(
    {
      error:
        "POST /api/mediaplans/[id]/mbanumber is retired (X3). Use GET /api/mediaplans/mbanumber?mbaidentifier=",
      code: "MBANUMBER_BY_ID_GONE",
    },
    { status: 410 }
  )
}
