/**
 * AVA-UX-1 — client-visible ingest upload turn vs structured pending context.
 * Operator directives live in skillGuidance only. Numbers travel as
 * `pendingIngest.summary` (IngestChatSummary), never as user-turn prose.
 */

import type { IngestChatSummary } from "@/lib/mediaplans/ingest/summariseIngestReview"

export type PendingIngestPayload = {
  stageId: string
  fileName?: string
  summary?: IngestChatSummary
  missing?: boolean
}

export function buildIngestUploadUserMessage(fileName: string): string {
  return `Uploaded "${fileName}" — can you review it?`
}

export function buildPendingIngestPayload(args: {
  stageId: string
  fileName?: string
  summary?: IngestChatSummary | null
}): PendingIngestPayload {
  const pending: PendingIngestPayload = { stageId: args.stageId }
  if (args.fileName?.trim()) pending.fileName = args.fileName.trim()
  if (args.summary) pending.summary = args.summary
  return pending
}

export function pendingIngestChipCopy(state: {
  fileName?: string
  fullReviewPath?: string
  missing?: boolean
}): { kind: "pending" | "reattach"; text: string } {
  const fileBit = state.fileName?.trim() ? ` · ${state.fileName.trim()}` : ""
  if (state.missing) {
    return {
      kind: "reattach",
      text: `Re-attach to continue${fileBit}`,
    }
  }
  return {
    kind: "pending",
    text: `Pending ingest${fileBit}. Confirm in chat to accept.`,
  }
}

export function applyIngestStageMissingMeta(
  pending: PendingIngestPayload | null,
  meta: { ingestStageMissing?: boolean } | null | undefined,
): PendingIngestPayload | null {
  if (!pending) return null
  if (!meta?.ingestStageMissing) return pending
  return { ...pending, missing: true }
}
