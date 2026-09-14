import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { createLinkedPublisherProfile } from "@/lib/mediaplans/ingest/createLinkedPublisherProfile"
import { attachCatalogueToDraft } from "@/lib/mediaplans/ingest/confirmPublisherProfile"
import { hasUnconfirmedProposedProfile } from "@/lib/mediaplans/ingest/proposePublisherProfile"
import {
  lookupIngestStage,
  patchIngestStageReview,
} from "@/lib/mediaplans/ingest/ingestStageStore.server"

export const runtime = "nodejs"

/** Human catalogue pick for an unknown publisher — never guess. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth && auth.response) {
    return auth.response
  }

  try {
    const body = (await request.json()) as {
      id?: number
      publisher_name?: string
      publisherid?: string | null
      pub_ooh?: boolean | null
      pub_radio?: boolean | null
      stageId?: string | null
    }
    const id = Number(body.id)
    const publisher_name = String(body.publisher_name ?? "").trim()
    if (!Number.isFinite(id) || id <= 0 || !publisher_name) {
      return NextResponse.json(
        { error: "id and publisher_name required" },
        { status: 400 },
      )
    }
    const catalogue = {
      id,
      publisher_name,
      publisherid: body.publisherid ?? null,
      pub_ooh: body.pub_ooh ?? null,
      pub_radio: body.pub_radio ?? null,
    }
    const stageId = String(body.stageId ?? "").trim()
    if (stageId) {
      const looked = await lookupIngestStage(stageId)
      if (looked.ok && hasUnconfirmedProposedProfile(looked.staged.review)) {
        const draft = looked.staged.review.proposed_profile!.draft
        const stamped = attachCatalogueToDraft(draft, catalogue)
        const review = {
          ...looked.staged.review,
          needs_catalogue_choice: false,
          proposed_profile: { draft: stamped, confirmed: false as const },
        }
        await patchIngestStageReview(stageId, review)
        return NextResponse.json({
          profile: stamped,
          review,
          awaiting_profile_confirm: true,
        })
      }
    }
    const profile = await createLinkedPublisherProfile({ catalogue })
    return NextResponse.json({ profile })
  } catch (e) {
    console.error("[admin/ingest/link-publisher]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Link failed" },
      { status: 500 },
    )
  }
}
