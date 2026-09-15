import { NextRequest, NextResponse } from "next/server"

import { requireRole } from "@/lib/requireRole"
import { checkClientMbaAccess } from "@/lib/auth/checkClientMbaAccess"
import { draftDocumentsBodySchema } from "@/lib/docs/draftDocumentsBody"
import { renderDraftDocuments } from "@/lib/docs/renderDraftDocuments"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

/**
 * Publish dry-run: MBA PDF or Media Plan workbook from the save body.
 * Writes nothing. Admin only. Header X-Document-State: draft.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = draftDocumentsBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const body = parsed.data
  const access = await checkClientMbaAccess(request, body.mbaNumber)
  if (!access.ok) return access.response

  const rendered = await renderDraftDocuments(body)
  return new NextResponse(new Uint8Array(rendered.buffer), {
    status: 200,
    headers: {
      "Content-Type": rendered.mime,
      "Content-Disposition": `attachment; filename="${rendered.filename}"`,
      "X-Document-State": "draft",
    },
  })
}
