import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { executeIngestAcceptWithCampaign } from "@/lib/mediaplans/ingest/executeIngestAccept"
import type { IngestProposal } from "@/lib/mediaplans/ingest/proposeLineItems"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"
import type { SavePlanMode } from "@/lib/data/savePlan"

export const runtime = "nodejs"

/**
 * Accept a reviewed ingest proposal.
 * Always goes through savePlanVersion — never a parallel write path.
 * Never auto-accepts; caller must POST after human confirmation.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      proposal?: IngestProposal
      masterId?: number
      mbaNumber?: string
      versionNumber?: number
      mode?: SavePlanMode
      feeLoading?: FeeLoading
      campaignName?: string | null
      campaignStatus?: string | null
      campaignStartDate?: string | null
      campaignEndDate?: string | null
      brand?: string | null
      channelFlags?: Record<string, unknown> | null
      fileName?: string | null
      detectedConfidence?: number | null
    }

    if (!body.proposal || !body.masterId || !body.mbaNumber?.trim()) {
      return NextResponse.json(
        { error: "proposal, masterId, mbaNumber required" },
        { status: 400 },
      )
    }

    const uploadedBy =
      typeof auth.session?.user?.email === "string"
        ? auth.session.user.email.trim().toLowerCase()
        : null

    const result = await executeIngestAcceptWithCampaign({
      proposal: body.proposal,
      campaign: {
        masterId: body.masterId,
        mbaNumber: body.mbaNumber.trim(),
        versionNumber: body.versionNumber ?? 1,
        mode: body.mode ?? "draft",
        campaignName: body.campaignName,
        campaignStatus: body.campaignStatus,
        campaignStartDate: body.campaignStartDate,
        campaignEndDate: body.campaignEndDate,
        brand: body.brand,
        channelFlags: body.channelFlags,
      },
      uploadedBy,
      fileName: body.fileName ?? null,
      detectedConfidence: body.detectedConfidence ?? null,
      feeLoading: body.feeLoading ?? {},
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          reconciliation: result.reconciliation,
        },
        { status: result.status },
      )
    }

    const { ok: _ok, ...payload } = result
    return NextResponse.json({ ok: true, ...payload })
  } catch (e) {
    console.error("[admin/ingest/accept]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Accept failed" },
      { status: 500 },
    )
  }
}
