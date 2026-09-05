import { NextRequest, NextResponse } from "next/server"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { readPublishedDocumentsByMba } from "@/lib/docs/readPublishedVersionDocuments"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"

export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Published-version document metadata for an MBA.
 * Pointer is `media_plan_masters.published_version_id` (never max version,
 * never campaign_status). Unpublished → 200 with null ids and files.
 * Tenant: checkClientMbaAccess (same helper as GET /api/mediaplans/mba/[mba_number]).
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

    const result = await readPublishedDocumentsByMba(mba_number)
    if (!result.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json(result.payload)
  } catch (error) {
    console.error("[api/mediaplans/mba/[mba_number]/documents GET]", error)
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 })
  }
}
