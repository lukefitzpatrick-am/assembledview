/**
 * "Save and download all" (Q7, Luke, 1 Nov 2026): save first unless the plan is
 * unchanged. An unpublished plan always saves and publishes before zipping. A
 * published plan with unsaved edits or a working draft does the same, so the
 * zip never misses changes. Only an unchanged published plan zips the stored
 * documents without saving.
 */
export type SaveAndDownloadAllMode = "save_then_zip" | "zip_stored"

export function saveAndDownloadAllMode(input: {
  isPublished: boolean
  hasChanges: boolean
}): SaveAndDownloadAllMode {
  if (!input.isPublished) return "save_then_zip"
  return input.hasChanges ? "save_then_zip" : "zip_stored"
}
