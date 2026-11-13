import { NextResponse } from "next/server"

import { deleteTaskAttachmentBlob, storeTaskAttachmentBlob } from "@/lib/codex/attachmentBlob"
import { checkAttachmentFile, parseAttachmentLink } from "@/lib/codex/attachments"
import { checkCanAttach, createAttachment, listAttachments } from "@/lib/codex/collabRepo"
import { isCodexNotificationsEnabled, isCodexProjectsEnabled } from "@/lib/codex/flag"
import { parseId } from "@/lib/codex/projects"
import { codexFlagGuard, jsonError, requireCodexInternalAccess, sessionEmail } from "../../../_shared"
import { projectFailureResponse, projectsErrorResponse } from "../../../projects/_gate"

export const runtime = "nodejs"
export const maxDuration = 60

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Task attachments (B41). GET lists them (never a blob pathname). POST
 * multipart with one `file` uploads it to Vercel Blob (private, 4 MB, the
 * types in lib/codex/attachments.ts); POST JSON `{ url, name? }` attaches a
 * link. Files are fetched through ./[attachmentId] only. Behind
 * codex_projects; 503 before 0118; a private project's task you cannot see
 * is 404.
 */
async function gate(request: Request, context: RouteContext) {
  const flag = await codexFlagGuard()
  if (flag) return { ok: false as const, error: flag }
  if (!(await isCodexProjectsEnabled())) return { ok: false as const, error: jsonError(404, "not_found") }
  const auth = await requireCodexInternalAccess(request)
  if ("error" in auth) return { ok: false as const, error: auth.error }
  const email = sessionEmail(auth.session)
  if (!email) return { ok: false as const, error: jsonError(401, "unauthorised") }
  const id = parseId((await context.params).id)
  if (id == null) return { ok: false as const, error: jsonError(404, "not_found") }
  return { ok: true as const, email, id, roles: auth.roles as readonly string[] }
}

export async function GET(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  try {
    const result = await listAttachments(g.id, g.email, g.roles)
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ attachments: result.attachments })
  } catch (error) {
    return projectsErrorResponse(error, "list attachments")
  }
}

export async function POST(request: Request, context: RouteContext) {
  const g = await gate(request, context)
  if (!g.ok) return g.error
  const type = request.headers.get("content-type") ?? ""
  try {
    const notify = await isCodexNotificationsEnabled()
    if (type.includes("multipart/form-data")) {
      let form: FormData
      try {
        form = await request.formData()
      } catch {
        return jsonError(400, "bad_request", "Send one file as multipart form data.")
      }
      const files = [...form.values()].filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v)
      if (files.length !== 1) return jsonError(400, "file_required", "Send exactly one file.")
      const file = files[0]!
      const check = checkAttachmentFile({ name: file.name, size: file.size })
      if (!check.ok) return jsonError(check.error === "attachment_too_large" ? 413 : check.error === "attachment_type" ? 415 : 400, check.error, check.message)
      // Visibility and the count before the file goes anywhere.
      const can = await checkCanAttach(g.id, g.email)
      if (!can.ok) return projectFailureResponse(can)
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.length !== check.sizeBytes || bytes.length === 0) return jsonError(400, "file_empty", "The file did not arrive whole.")
      const pathname = await storeTaskAttachmentBlob(g.id, check.name, bytes, check.contentType)
      let result
      try {
        result = await createAttachment(g.id, g.email, g.roles, { kind: "blob", name: check.name, blobPathname: pathname, sizeBytes: bytes.length }, { notify })
      } catch (error) {
        await deleteTaskAttachmentBlob(pathname)
        throw error
      }
      if (!result.ok) {
        await deleteTaskAttachmentBlob(pathname)
        return projectFailureResponse(result)
      }
      return NextResponse.json({ attachment: result.attachment }, { status: 201 })
    }
    const body = await request.json().catch(() => null)
    const link = parseAttachmentLink(body)
    if (!link.ok) return jsonError(400, link.error, link.message)
    const result = await createAttachment(g.id, g.email, g.roles, { kind: "link", name: link.name, url: link.url }, { notify })
    if (!result.ok) return projectFailureResponse(result)
    return NextResponse.json({ attachment: result.attachment }, { status: 201 })
  } catch (error) {
    return projectsErrorResponse(error, "add attachment")
  }
}
