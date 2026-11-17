import { NextResponse } from "next/server"
import { BlobNotFoundError } from "@vercel/blob"

import { deleteTaskAttachmentBlob } from "@/lib/codex/attachmentBlob"
import { deleteAttachment, getAttachmentFile } from "@/lib/codex/collabRepo"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { isFeatureOn } from "@/lib/features/server"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../../projects/_gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string; attachmentId: string }> }

/**
 * One attachment (B41). GET streams a file attachment to someone who can see
 * the task (its private project's rule), never a public URL; a link
 * attachment is opened from its URL, so GET on it is 404. DELETE by the
 * uploader or an admin (403 not_uploader), the Blob file after the row.
 * Behind codex_projects.
 */
async function gate(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return { ok: false as const, error: flag }
  if (!(await isFeatureOn("codex_projects"))) return { ok: false as const, error: jsonError(404, "not_found") }
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return { ok: false as const, error: auth.error }
  const email = sessionEmail(auth.session)
  if (!email) return { ok: false as const, error: jsonError(401, "unauthorised") }
  const params = await context.params
  const id = parseId(params.id)
  const attachmentId = parseId(params.attachmentId)
  if (id == null || attachmentId == null) return { ok: false as const, error: jsonError(404, "not_found") }
  return { ok: true as const, email, id, attachmentId, roles: auth.roles as readonly string[] }
}

function dispositionName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

export async function GET(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  try {
    const file = await getAttachmentFile(g.id, g.attachmentId, g.email)
    if (!file.ok) return projectFailureResponse(file)
    const blob = await getPrivateBlob(file.pathname)
    if (!blob || blob.statusCode !== 200 || !blob.stream) return jsonError(404, "not_found", "The file is missing.")
    return new NextResponse(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": dispositionName(file.name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    if (error instanceof BlobNotFoundError) return jsonError(404, "not_found", "The file is missing.")
    return projectsErrorResponse(error, "fetch attachment")
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  try {
    const result = await deleteAttachment(g.id, g.attachmentId, g.email, g.roles)
    if (!result.ok) return projectFailureResponse(result)
    if (result.blobPathname) await deleteTaskAttachmentBlob(result.blobPathname)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return projectsErrorResponse(error, "delete attachment")
  }
}
