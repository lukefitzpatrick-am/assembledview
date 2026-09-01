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

function spokenMediaType(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const lower = trimmed.toLowerCase()
  if (lower === "ooh") return "OOH"
  if (lower === "bvod") return "BVOD"
  if (lower === "tv") return "TV"
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function aOrAn(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

/** Local attach confirmation — not a model turn, not user-turn prose. */
export function buildIngestProposalPrompt(input: {
  fileName: string
  summary?: IngestChatSummary
}): { text: string; confirmLabel: string; dismissLabel: string } {
  const confirmLabel = "Review it"
  const dismissLabel = "Not now"
  const fileName = input.fileName.trim() || "file"
  const mediaRaw = input.summary?.media_type?.trim() ?? ""
  const publisher = input.summary?.detected_publisher?.trim() ?? ""
  const media = spokenMediaType(mediaRaw)
  if (!media || !publisher) {
    return { text: `Review "${fileName}"?`, confirmLabel, dismissLabel }
  }
  const count = input.summary?.line_item_count ?? 0
  const countBit =
    count > 0 ? `, ${count} line${count === 1 ? "" : "s"}` : ""
  return {
    text: `This looks like ${aOrAn(media)} ${media} schedule from ${publisher}${countBit}. Review it into a campaign?`,
    confirmLabel,
    dismissLabel,
  }
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
      text: `Attach the file again${fileBit}`,
    }
  }
  return {
    kind: "pending",
    text: `Schedule ready${fileBit}. Confirm in chat to accept.`,
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
