/**
 * Task attachments (B41). Pure: client-safe, no database, no Blob calls.
 *
 * Two kinds in `task_attachments`:
 * - `blob`: a file uploaded to Vercel Blob with private access. The stored
 *   pathname never reaches the browser; the file is served only through
 *   `GET /api/codex/tasks/[id]/attachments/[attachmentId]`, which checks the
 *   task (and its private project) first.
 * - `link`: an http(s) URL, shown with its host.
 *
 * Limits: ATTACHMENT_MAX_BYTES per file (under Vercel's 4.5 MB request body
 * limit, since the file comes through our route), the file types below by
 * extension (the stored and served content type comes from the extension,
 * never from the browser), ATTACHMENTS_PER_TASK_MAX per task. A bigger file
 * goes in SharePoint and is attached as a link (plan 4.4 step 4).
 */

export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024
export const ATTACHMENTS_PER_TASK_MAX = 50
export const ATTACHMENT_NAME_MAX = 200
export const ATTACHMENT_URL_MAX = 2000

/** Extension to the content type we store and serve. SVG and HTML are not allowed (script). */
export const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
}

export type TaskAttachmentKind = "blob" | "link"

/** What the API returns. Never the blob pathname. */
export type TaskAttachment = {
  id: number
  task_id: number
  kind: TaskAttachmentKind
  name: string
  /** Link kind only. */
  url: string | null
  /** Link kind: the URL's host. Blob kind: null. */
  host: string | null
  size_bytes: number | null
  content_type: string | null
  uploaded_by_email: string
  created_at: string
  /** Can the viewer delete it (uploader or admin). */
  can_delete: boolean
}

export type ParseFail = { ok: false; error: string; message: string }
const fail = (error: string, message: string): ParseFail => ({ ok: false, error, message })

/** The file name without any folder part, control characters or extra spaces, at most ATTACHMENT_NAME_MAX. */
export function cleanAttachmentName(raw: unknown): string {
  const base = String(raw ?? "").split(/[\\/]/).pop() ?? ""
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()
  if (cleaned.length <= ATTACHMENT_NAME_MAX) return cleaned
  const dot = cleaned.lastIndexOf(".")
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : ""
  return cleaned.slice(0, ATTACHMENT_NAME_MAX - ext.length) + ext
}

export function attachmentExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

export type FileCheck = { ok: true; name: string; contentType: string; sizeBytes: number } | ParseFail

/** A file upload: name, type by extension, size. */
export function checkAttachmentFile(file: { name: unknown; size: unknown } | null): FileCheck {
  if (!file) return fail("file_required", "Choose one file to attach.")
  const name = cleanAttachmentName(file.name)
  if (!name) return fail("file_required", "The file needs a name.")
  const contentType = ATTACHMENT_TYPES[attachmentExtension(name)]
  if (!contentType) {
    return fail(
      "attachment_type",
      "That file type cannot be attached. Use PDF, an image, Word, Excel, PowerPoint, CSV, text or zip, or attach a link.",
    )
  }
  const size = Number(file.size)
  if (!Number.isFinite(size) || size <= 0) return fail("file_empty", "The file is empty.")
  if (size > ATTACHMENT_MAX_BYTES) {
    return fail("attachment_too_large", "Files over 4 MB cannot be uploaded here. Put it in SharePoint and attach the link.")
  }
  return { ok: true, name, contentType, sizeBytes: size }
}

/** The private Blob pathname for a task file. Random suffix added by the store. */
export function attachmentBlobPathname(taskId: number, name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file"
  return `codex/tasks/${taskId}/${safe}`
}

/** A blob pathname belongs to this task's folder (download and delete check it). */
export function isTaskBlobPathname(taskId: number, pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && pathname.startsWith(`codex/tasks/${taskId}/`) && !pathname.includes("..")
}

export type LinkCheck = { ok: true; url: string; host: string; name: string } | ParseFail

/** A link attachment: http or https, a host, no user or password, at most ATTACHMENT_URL_MAX. */
export function parseAttachmentLink(body: unknown): LinkCheck {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  const text = typeof raw.url === "string" ? raw.url.trim() : ""
  if (!text) return fail("invalid_link", "Paste the link to attach.")
  if (text.length > ATTACHMENT_URL_MAX) return fail("invalid_link", "That link is too long.")
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return fail("invalid_link", "That is not a full link. Paste the whole address, starting with https.")
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return fail("invalid_link", "Only http and https links can be attached.")
  if (u.username || u.password) return fail("invalid_link", "Links with a user name or password cannot be attached.")
  const host = u.hostname.toLowerCase()
  if (!host || !host.includes(".")) return fail("invalid_link", "That link has no proper host.")
  const named = cleanAttachmentName(typeof raw.name === "string" ? raw.name : "")
  // The last part of the path (cleanAttachmentName drops folders), else the host.
  let path = u.pathname.replace(/\/+$/, "")
  try {
    path = decodeURIComponent(path)
  } catch {
    // keep the encoded path
  }
  const fallback = cleanAttachmentName(path)
  return { ok: true, url: u.toString(), host, name: named || fallback || host }
}

/** The host shown beside a link, or null when the stored URL does not parse. */
export function attachmentHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

/** The uploader or an admin may delete an attachment. */
export function canDeleteAttachment(
  attachment: { uploaded_by_email: string | null | undefined },
  viewerEmail: string | null | undefined,
  viewerRoles: readonly string[],
): boolean {
  const viewer = String(viewerEmail ?? "").trim().toLowerCase()
  const uploader = String(attachment.uploaded_by_email ?? "").trim().toLowerCase()
  if (viewer && uploader && viewer === uploader) return true
  return viewerRoles.includes("admin")
}

/** "1.2 MB", "340 KB". */
export function formatAttachmentSize(bytes: number | null | undefined): string {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
