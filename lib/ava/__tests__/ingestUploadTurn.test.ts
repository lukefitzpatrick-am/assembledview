/**
 * AVA-UX-1 — ingest upload turn is a short user sentence; numbers travel
 * as pendingIngest.summary (IngestChatSummary); operator directives live
 * once in skillGuidance.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { AVA_SKILL_GUIDANCE } from "../skills/skillGuidance.js"
import {
  applyIngestStageMissingMeta,
  buildIngestProposalPrompt,
  buildIngestUploadUserMessage,
  buildPendingIngestPayload,
  pendingIngestChipCopy,
} from "../ingestUploadTurn.js"
import type { IngestChatSummary } from "@/lib/mediaplans/ingest/summariseIngestReview"

const DIRECTIVE_NEEDLE =
  "call get_pending_ingest_review; echo the confirmed block"
const OPERATOR_FRAGMENTS = [
  "Call get_pending_ingest_review",
  "do not invent figures",
  "Wait for my confirm before accept_ingest_proposal",
  "never guess",
]
const NUMERIC_DUMP_FRAGMENTS = [
  "Hub ingest (stage",
  "Required coverage",
  "Money delta",
  "line_item_count",
  "Lines ",
]

function sampleSummary(stageId: string): IngestChatSummary {
  return {
    stageId,
    fileName: "qms.xlsx",
    detected_publisher: "QMS",
    publisher_confidence: 0.94,
    media_type: "ooh",
    line_item_count: 41,
    panel_count: 41,
    burst_count: 12,
    required_coverage: 1,
    money_delta: 0,
    money_delta_pct: 0,
    file_stated_total: 1000,
    total_media_amount: 1000,
    accept_ok: true,
    block_reason: null,
    ignored: [],
    ignored_rows: [],
    columns_unmapped: [],
    unknown_publisher: false,
    no_profile_message: null,
    full_review_path: `/admin/schedule-ingest?stage=${stageId}`,
  }
}

test("upload user message is a short sentence with no operator directives or numeric dump", () => {
  const msg = buildIngestUploadUserMessage("qms.xlsx")
  assert.equal(msg, 'Uploaded "qms.xlsx" — can you review it?')
  for (const frag of OPERATOR_FRAGMENTS) {
    assert.doesNotMatch(msg, new RegExp(frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  for (const frag of NUMERIC_DUMP_FRAGMENTS) {
    assert.equal(msg.includes(frag), false, `user message leaked dump fragment: ${frag}`)
  }
  assert.doesNotMatch(msg, /\b41\b/)
  assert.doesNotMatch(msg, /0\.94/)
})

test("ingest proposal prompt uses media type and publisher, never money totals", () => {
  const summary = sampleSummary("stg-1")
  summary.detected_publisher = "JCDecaux"
  summary.media_type = "ooh"
  summary.line_item_count = 106
  const rich = buildIngestProposalPrompt({ fileName: "jcd.xlsx", summary })
  assert.equal(
    rich.text,
    "This looks like an OOH schedule from JCDecaux, 106 lines. Review it into a campaign?",
  )
  assert.equal(rich.confirmLabel, "Review it")
  assert.equal(rich.dismissLabel, "Not now")
  assert.doesNotMatch(rich.text, /1000/)
  assert.doesNotMatch(rich.text, /money/i)
  assert.equal(rich.text.includes(String(summary.file_stated_total)), false)
  assert.equal(rich.text.includes(String(summary.total_media_amount)), false)

  const plain = buildIngestProposalPrompt({ fileName: "mystery.xlsx" })
  assert.equal(plain.text, 'Review "mystery.xlsx"?')
  assert.equal(plain.confirmLabel, "Review it")
  assert.equal(plain.dismissLabel, "Not now")

  const noPublisher = buildIngestProposalPrompt({
    fileName: "qms.xlsx",
    summary: { ...summary, detected_publisher: null },
  })
  assert.equal(noPublisher.text, 'Review "qms.xlsx"?')
})

test("structured ingest summary travels on pendingIngest, not in the user turn", () => {
  const stageId = "stg-1"
  const summary = sampleSummary(stageId)
  const pending = buildPendingIngestPayload({
    stageId,
    fileName: "qms.xlsx",
    summary,
  })
  assert.equal(pending.stageId, stageId)
  assert.equal(pending.fileName, "qms.xlsx")
  assert.equal(pending.summary?.line_item_count, 41)
  assert.equal(pending.summary?.detected_publisher, "QMS")
  assert.deepEqual(pending.summary, summary)
  const msg = buildIngestUploadUserMessage("qms.xlsx")
  assert.equal(msg.includes(JSON.stringify(summary)), false)
  assert.equal(msg.includes(String(summary.line_item_count)), false)
})

test("ingest operator directives are stated once in skillGuidance, not in ChatWidget", () => {
  const hay = AVA_SKILL_GUIDANCE.toLowerCase()
  const needle = DIRECTIVE_NEEDLE.toLowerCase()
  const count = hay.split(needle).length - 1
  assert.equal(count, 1, `expected directive once in skillGuidance, got ${count}`)
  assert.match(AVA_SKILL_GUIDANCE, /never guess/i)
  assert.match(AVA_SKILL_GUIDANCE, /wait for confirm then accept_ingest_proposal/i)

  const widget = fs.readFileSync(
    path.join(process.cwd(), "components/ChatWidget.tsx"),
    "utf8",
  )
  for (const frag of OPERATOR_FRAGMENTS) {
    assert.equal(
      widget.includes(frag),
      false,
      `ChatWidget still leaks operator fragment: ${frag}`,
    )
  }
  assert.equal(widget.includes("I uploaded publisher schedule"), false)
})

test("footer chip switches to Attach the file again when the stage is missing", () => {
  const pending = pendingIngestChipCopy({
    fileName: "qms.xlsx",
    fullReviewPath: "/admin/schedule-ingest?stage=stg-1",
  })
  assert.equal(pending.kind, "pending")
  assert.match(pending.text, /Schedule ready/)
  assert.match(pending.text, /Confirm in chat to accept/)

  const missing = pendingIngestChipCopy({
    fileName: "qms.xlsx",
    fullReviewPath: "/admin/schedule-ingest?stage=stg-1",
    missing: true,
  })
  assert.equal(missing.kind, "reattach")
  assert.match(missing.text, /Attach the file again/)
  assert.doesNotMatch(missing.text, /Schedule ready/)
  assert.doesNotMatch(missing.text, /Confirm in chat to accept/)

  const tagged = applyIngestStageMissingMeta(
    { stageId: "stg-1", fileName: "qms.xlsx" },
    { ingestStageMissing: true },
  )
  assert.equal(tagged?.missing, true)
  const chip = pendingIngestChipCopy(tagged!)
  assert.equal(chip.kind, "reattach")
})
