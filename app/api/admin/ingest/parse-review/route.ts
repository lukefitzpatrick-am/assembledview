import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import {
  getIngestStage,
  patchIngestStageReview,
} from "@/lib/mediaplans/ingest/ingestStageStore.server"
import {
  confirmAllGreen,
  includeExcludedRow,
  parseReviewLoadGate,
  recordRowDecision,
  resolveParseReviewDiscrepancy,
} from "@/lib/mediaplans/ingest/parseReview"
import {
  applyParseReviewOverrideProposal,
  resolveParseReviewValue,
} from "@/lib/mediaplans/ingest/parseReview.server"
import { ingestReviewToFormLineItems } from "@/lib/mediaplans/ingest/toFormLineItems"
import { ingestParseReviewPath } from "@/lib/mediaplans/ingest/ingestParseReviewPath"
import { rerunStagedLineAuditFromSourceFile } from "@/lib/mediaplans/ingest/ingestSourceFile"
import { listPublisherProfiles } from "@/lib/mediaplans/ingest/loadPublisherProfiles.server"
import { createAnthropicLineAuditClient } from "@/lib/mediaplans/ingest/lineAudit.server"
import type { AutopopulateChannel } from "@/lib/ava/autopopulate/types"

export const runtime = "nodejs"
export const maxDuration = 60

function sessionEmail(auth: {
  session: { user?: { email?: string | null } } | null | undefined
}): string | null {
  const email = auth.session?.user?.email?.trim().toLowerCase()
  return email || null
}

function asFormItems(items: unknown[]): Record<string, unknown>[] {
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  )
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response

  const by = sessionEmail(auth)
  if (!by) {
    return NextResponse.json(
      { error: "session identity required" },
      { status: 400 },
    )
  }

  try {
    const body = (await request.json()) as {
      stageId?: string
      action?: string
      row?: number
      answer?: string
      note?: string
      header?: string
      mappedTo?: string
      mbaNumber?: string | null
    }
    const stageId = body.stageId?.trim()
    if (!stageId) {
      return NextResponse.json({ error: "stageId required" }, { status: 400 })
    }
    const staged = await getIngestStage(stageId)
    if (!staged) {
      return NextResponse.json({ error: "Staged ingest not found" }, { status: 404 })
    }
    let review = staged.review
    const action = body.action?.trim() ?? ""
    const row = Number(body.row)

    switch (action) {
      case "confirm":
        if (!Number.isInteger(row) || row <= 0) {
          return NextResponse.json({ error: "row required" }, { status: 400 })
        }
        review = recordRowDecision({
          review,
          row,
          status: "confirmed",
          by,
          note: body.note ?? null,
        })
        break
      case "exclude":
        if (!Number.isInteger(row) || row <= 0) {
          return NextResponse.json({ error: "row required" }, { status: 400 })
        }
        review = recordRowDecision({
          review,
          row,
          status: "excluded",
          by,
          note: body.note ?? null,
        })
        break
      case "include":
        if (!Number.isInteger(row) || row <= 0) {
          return NextResponse.json({ error: "row required" }, { status: 400 })
        }
        review = includeExcludedRow({ review, row, by })
        break
      case "confirm_all_green":
        review = confirmAllGreen({ review, by })
        break
      case "resolve_discrepancy":
        if (!Number.isInteger(row) || row <= 0 || !body.answer?.trim()) {
          return NextResponse.json(
            { error: "row and answer required" },
            { status: 400 },
          )
        }
        review = resolveParseReviewDiscrepancy({
          review,
          row,
          answer: body.answer.trim(),
          by,
        })
        break
      case "resolve_value": {
        if (!Number.isInteger(row) || row <= 0 || !body.answer?.trim()) {
          return NextResponse.json(
            { error: "row and answer required" },
            { status: 400 },
          )
        }
        const resolved = await resolveParseReviewValue({
          review,
          row,
          answer: body.answer.trim(),
          by,
          stageId,
        })
        review = resolved.review
        await patchIngestStageReview(stageId, review)
        return NextResponse.json({
          review,
          resolvedRows: resolved.resolvedRows,
          canonical: resolved.canonical,
          synonymWritten: resolved.synonymWritten,
        })
      }
      case "apply_override_proposal": {
        if (!body.header?.trim() || !body.mappedTo?.trim()) {
          return NextResponse.json(
            { error: "header and mappedTo required" },
            { status: 400 },
          )
        }
        const applied = await applyParseReviewOverrideProposal({
          review,
          header: body.header.trim(),
          mappedTo: body.mappedTo.trim(),
          by,
          stageId,
        })
        if (!applied.applied) {
          return NextResponse.json(
            { error: applied.reason ?? "Override was not applied." },
            { status: 409 },
          )
        }
        review = applied.review
        await patchIngestStageReview(stageId, review)
        return NextResponse.json({ review, applied: true })
      }
      case "rerun_audit": {
        const { profiles } = await listPublisherProfiles()
        const auditOff = process.env.INGEST_AUDIT === "off"
        const rerun = await rerunStagedLineAuditFromSourceFile({
          stageId,
          profiles,
          lineAuditClient: auditOff ? null : createAnthropicLineAuditClient(),
        })
        if (!rerun.ok) {
          return NextResponse.json(
            { error: rerun.error, code: "code" in rerun ? rerun.code : undefined },
            { status: rerun.status },
          )
        }
        return NextResponse.json({ review: rerun.review })
      }
      case "load": {
        const gate = parseReviewLoadGate(review)
        if (!gate.ok) {
          return NextResponse.json({ error: gate.reason }, { status: 409 })
        }
        const converted = ingestReviewToFormLineItems(review)
        const items = asFormItems(converted.items)
        if (items.length === 0) {
          return NextResponse.json(
            { error: "That schedule didn't produce line items to load." },
            { status: 409 },
          )
        }
        const mba = body.mbaNumber?.trim() || "create"
        const redirectTo =
          mba === "create"
            ? "/mediaplans/create"
            : `/mediaplans/mba/${encodeURIComponent(mba)}/edit`
        return NextResponse.json({
          review,
          channel: converted.channel as AutopopulateChannel,
          items,
          ingestStageId: stageId,
          redirectTo,
          parseReviewPath: ingestParseReviewPath(stageId, mba),
        })
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 })
    }

    await patchIngestStageReview(stageId, review)
    return NextResponse.json({ review })
  } catch (e) {
    console.error("[admin/ingest/parse-review]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Parse review failed" },
      { status: 500 },
    )
  }
}
