import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { storePlanVersionDocuments } from "@/lib/docs/storePlanVersionDocuments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

type FileLike = Blob & { name?: string }

function isFileLike(value: unknown): value is FileLike {
  if (!value || typeof value !== "object") return false
  return typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function"
}

/**
 * Attach MBA / media-plan / AA files to a version after publish.
 * Multipart fields (`media_plan`, `mba_pdf`, `aa_media_plan`, `mp_client_name`)
 * are the contract with `uploadMediaPlanVersionDocuments` — `mp_client_name`
 * is accepted and ignored (client name lives on the master).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  try {
    const { id } = await params
    const versionId = Number(id)
    if (!id || !Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ error: "Missing version id" }, { status: 400 })
    }

    const incoming = await request.formData()
    const mediaPlan = incoming.get("media_plan")
    const mbaPdf = incoming.get("mba_pdf")
    const aaMediaPlan = incoming.get("aa_media_plan")
    // Multipart contract with uploadMediaPlanVersionDocuments — unused here
    // (client name lives on media_plan_masters, not the version file columns).
    void incoming.get("mp_client_name")

    const wantsMediaPlan = isFileLike(mediaPlan)
    const wantsMbaPdf = isFileLike(mbaPdf)
    const wantsAaMediaPlan = isFileLike(aaMediaPlan)

    if (!wantsMediaPlan && !wantsMbaPdf && !wantsAaMediaPlan) {
      return NextResponse.json(
        { error: "No files provided. Expected `media_plan`, `mba_pdf`, and/or `aa_media_plan`." },
        { status: 400 },
      )
    }

    const result = await storePlanVersionDocuments({
      versionId,
      files: {
        ...(wantsMbaPdf ? { mba_pdf: mbaPdf } : {}),
        ...(wantsMediaPlan ? { media_plan: mediaPlan } : {}),
        ...(wantsAaMediaPlan ? { aa_media_plan: aaMediaPlan } : {}),
      },
    })

    if (result.status === "not_found") {
      return NextResponse.json({ error: "Version not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, files: result.files })
  } catch (error) {
    console.error("[api/mediaplans/versions/documents POST]", error)
    return NextResponse.json({ error: "Failed to upload documents" }, { status: 500 })
  }
}
