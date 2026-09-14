import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { confirmStagedProposedProfile } from "@/lib/mediaplans/ingest/confirmPublisherProfile"
import { hasUnconfirmedProposedProfile } from "@/lib/mediaplans/ingest/proposePublisherProfile"
import { lookupIngestStage } from "@/lib/mediaplans/ingest/ingestStageStore.server"
import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles.server"
import { createAnthropicLineAuditClient } from "@/lib/mediaplans/ingest/lineAudit.server"

export const runtime = "nodejs"
export const maxDuration = 300

function sessionIdentity(auth: {
  session: { user?: { email?: string | null } } | null | undefined
}): string | null {
  return auth.session?.user?.email?.trim() || null
}

/**
 * Planner confirms a model-proposed profile (after catalogue pick).
 * Inserts the profile, then re-parses from the staged source_file.
 * Never loads from an unconfirmed draft. No re-upload.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const confirmedBy = sessionIdentity(auth)
    if (!confirmedBy) {
      return NextResponse.json(
        { error: "session identity required — confirm cannot be anonymous" },
        { status: 400 },
      )
    }
    const body = (await request.json()) as {
      stageId?: string
      id?: number
      publisher_name?: string
      publisherid?: string | null
      pub_ooh?: boolean | null
      pub_radio?: boolean | null
    }
    const stageId = String(body.stageId ?? "").trim()
    const id = Number(body.id)
    const publisher_name = String(body.publisher_name ?? "").trim()
    if (!stageId || !Number.isFinite(id) || id <= 0 || !publisher_name) {
      return NextResponse.json(
        { error: "stageId, id and publisher_name required" },
        { status: 400 },
      )
    }
    const looked = await lookupIngestStage(stageId)
    if (!looked.ok) {
      return NextResponse.json(
        { error: "Staged ingest not found" },
        { status: 404 },
      )
    }
    if (!hasUnconfirmedProposedProfile(looked.staged.review)) {
      return NextResponse.json(
        { error: "There is no unconfirmed proposed profile to insert." },
        { status: 409 },
      )
    }
    const { profiles } = await listPublisherProfiles()
    const auditOff = process.env.INGEST_AUDIT === "off"
    const confirmed = await confirmStagedProposedProfile({
      stageId,
      confirmedBy,
      catalogue: {
        id,
        publisher_name,
        publisherid: body.publisherid ?? null,
        pub_ooh: body.pub_ooh ?? null,
        pub_radio: body.pub_radio ?? null,
      },
      profiles,
      lineAuditClient: auditOff ? null : createAnthropicLineAuditClient(),
    })
    if (!confirmed.ok) {
      return NextResponse.json(
        {
          error: confirmed.error,
          code: "code" in confirmed ? confirmed.code : undefined,
        },
        { status: confirmed.status },
      )
    }
    return NextResponse.json({
      profile: confirmed.profile,
      review: confirmed.review,
      stageId,
    })
  } catch (e) {
    console.error("[admin/ingest/confirm-profile]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Confirm failed" },
      { status: 500 },
    )
  }
}
