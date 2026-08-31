import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import {
  CampaignStatusWriteError,
  writeCampaignStatus,
} from "@/lib/data/writeCampaignStatus"
import { SELECTABLE_CAMPAIGN_STATUSES } from "@/lib/mediaplan/campaignStatusGuard"
import { invalidMbaNumberResponse, parseMbaNumber } from "@/lib/mediaplan/mbaNumber"

export const dynamic = "force-dynamic"
export const revalidate = 0

const patchBodySchema = z.object({
  status: z.enum(SELECTABLE_CAMPAIGN_STATUSES),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number: rawMbaNumber } = await params
    const mba_number = parseMbaNumber(rawMbaNumber)
    if (!mba_number) return invalidMbaNumberResponse()

    const access = await checkClientMbaAccess(request, mba_number)
    if (!access.ok) return access.response

    const parsed = patchBodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "status must be one of planned, approved, booked, cancelled" },
        { status: 422 }
      )
    }

    const result = await writeCampaignStatus(mba_number, parsed.data.status)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof CampaignStatusWriteError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("[api/mediaplans/mba/[mba_number]/status PATCH]", error)
    return NextResponse.json({ error: "Failed to update campaign status" }, { status: 500 })
  }
}
