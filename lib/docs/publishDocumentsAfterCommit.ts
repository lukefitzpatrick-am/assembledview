/**
 * Best-effort plan documents after a publish commit.
 * Never runs inside the save transaction. A render/Blob failure is named on
 * the save response; it does not roll back the version.
 */

import { DOC_SKIP_REASON } from "@/lib/docs/saveDocSteps"
import type { RegeneratePlanVersionDocumentsResult } from "@/lib/docs/regeneratePlanVersionDocuments"

export type PublishDocumentsStatus = "ok" | "error" | "skipped"

export type PublishDocumentsResult = {
  status: PublishDocumentsStatus
  error?: string
  results?: Array<{ kind: string; status: string; error?: string }>
}

export function summarizeRegenerateForSaveModal(
  result: RegeneratePlanVersionDocumentsResult,
): PublishDocumentsResult {
  if (result.status === "not_found") {
    return { status: "error", error: "not_found" }
  }
  if (result.status === "not_published") {
    return { status: "error", error: "NOT_PUBLISHED" }
  }
  const failures = result.results.filter((row) => row.status === "error")
  if (failures.length > 0) {
    return {
      status: "error",
      error: failures
        .map((row) => `${row.kind}: ${row.error ?? "error"}`)
        .join("; "),
      results: result.results,
    }
  }
  return { status: "ok", results: result.results }
}

export async function runPublishDocumentsBestEffort(args: {
  published: boolean
  versionId: number
  regenerate?: (input: {
    versionId: number
  }) => Promise<RegeneratePlanVersionDocumentsResult>
}): Promise<PublishDocumentsResult> {
  if (!args.published) {
    return { status: "skipped", error: DOC_SKIP_REASON }
  }
  // node --test kill-shots must not PUT to Vercel Blob. Injected `regenerate`
  // still runs so this helper stays unit-testable.
  if (process.env.NODE_TEST_CONTEXT && !args.regenerate) {
    return { status: "skipped", error: "node:test seam — no Blob" }
  }
  try {
    const regenerate =
      args.regenerate ??
      (await import("@/lib/docs/regeneratePlanVersionDocuments"))
        .regeneratePlanVersionDocuments
    const regen = await regenerate({ versionId: args.versionId })
    return summarizeRegenerateForSaveModal(regen)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.warn("[docs] generate after publish failed", err)
    return { status: "error", error }
  }
}
