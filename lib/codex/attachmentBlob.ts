/**
 * Task attachment files in Vercel Blob (B41). Private access only, the same
 * mode as the planning uploads and naming exports; the pathname is stored in
 * `task_attachments.blob_pathname` and never sent to the browser. Files are
 * read back through `getPrivateBlob` in the gated download route.
 */
import "server-only"

import { del, put } from "@vercel/blob"

import { attachmentBlobPathname } from "@/lib/codex/attachments"

export async function storeTaskAttachmentBlob(taskId: number, name: string, bytes: Buffer, contentType: string): Promise<string> {
  const blob = await put(attachmentBlobPathname(taskId, name), bytes, {
    access: "private",
    contentType,
    addRandomSuffix: true,
  })
  return blob.pathname
}

/** Best effort: a file left behind is harmless (private, unreachable without its row). */
export async function deleteTaskAttachmentBlob(pathname: string): Promise<void> {
  try {
    await del(pathname)
  } catch (err) {
    console.warn("[codex-attachments] blob delete failed", { pathname, error: err instanceof Error ? err.message : String(err) })
  }
}
