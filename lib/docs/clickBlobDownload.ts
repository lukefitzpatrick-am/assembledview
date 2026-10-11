/** How long the blob URL stays alive after the anchor click. */
export const BLOB_DOWNLOAD_REVOKE_MS = 1000

/**
 * Download a blob from a user-gesture turn.
 * The anchor is in the document for the click, then removed.
 * The blob URL is revoked on a timeout so the browser can start the download.
 */
export function clickBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_DOWNLOAD_REVOKE_MS)
}
