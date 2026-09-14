/**
 * IG-11 commit 1 — line audit on stage (model pass, persisted).
 * Model is mocked; never a live Anthropic call.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { detectWorkbookShapesFromFile } from "../detectShape"
import {
  LINE_AUDIT_SYSTEM_PROMPT,
  PROFILE_RULE_LEAKS,
  auditRowsFromProposal,
  compactProposalRowsForChunk,
  runLineAudit,
  serializeChunkForModel,
  skippedLineAudit,
  sourceRowNumber,
  type LineAuditClient,
  type LineAuditRow,
} from "../lineAudit"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  chunkSheetBySection,
  encodeSheetTextGrid,
  headerBandRows,
} from "../sheetTextGrid"
import { stageIngestReviewFromBuffer } from "../stageIngestReview"
import { clearIngestStageForTests } from "../ingestStageStore"
import { getIngestStage } from "../ingestStageStore.server"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const JCD = path.join(FIX, "jcd_strength-meals_ooh.xlsx")

test.beforeEach(() => {
  clearIngestStageForTests()
})

function mockClient(rows: LineAuditRow[]): LineAuditClient {
  const prompts: string[] = []
  return {
    model: "mock-audit",
    async auditChunk(request) {
      const body = serializeChunkForModel(request)
      prompts.push(body)
      const want = new Set(request.data_rows)
      return rows.filter((r) => want.has(r.row))
    },
    prompts,
  } as LineAuditClient & { prompts: string[] }
}

test("JCD text grid encodes non-empty cells as A1 addresses", async () => {
  const shapes = await detectWorkbookShapesFromFile(JCD)
  const shape = shapes.find((s) => /jcd/i.test(s.sheet_name)) ?? shapes[0]!
  const cells = encodeSheetTextGrid(shape)
  assert.ok(cells.length > 1000)
  assert.ok(cells.every((c) => /^[A-Z]+[0-9]+$/.test(c.addr)))
  assert.ok(cells.every((c) => c.value.length > 0))
  assert.ok(cells.some((c) => /16$/.test(c.addr)))
})

test("JCD section chunks repeat header band 16-19 and do not leak profile rules", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(JCD, profiles, { skipAva: true })
  const shapes = await detectWorkbookShapesFromFile(JCD)
  const shape = shapes.find((s) => s.sheet_name === review.sheet_name) ?? shapes[0]!
  assert.equal(shape.header_row, 19)
  assert.deepEqual(headerBandRows(shape), [16, 17, 18, 19])
  const chunks = chunkSheetBySection(shape)
  assert.equal(chunks.length, 7)
  for (const chunk of chunks) {
    assert.deepEqual(chunk.header_band, [16, 17, 18, 19])
    assert.ok(chunk.data_rows.length > 0)
    const addrs = new Set(chunk.cells.map((c) => c.addr))
    assert.ok([...addrs].some((a) => a.endsWith("16") || a.endsWith("19")))
  }
  const request = {
    sheet_name: shape.sheet_name,
    header_band: chunks[0]!.header_band,
    section_row: chunks[0]!.section_row,
    data_rows: chunks[0]!.data_rows,
    grid: chunks[0]!.cells.map((c) => `${c.addr}\t${c.value}`).join("\n"),
    proposal_rows: compactProposalRowsForChunk(
      review.proposal!,
      chunks[0]!.data_rows,
    ),
  }
  const body = serializeChunkForModel(request)
  for (const leak of PROFILE_RULE_LEAKS) {
    assert.equal(body.toLowerCase().includes(leak), false, leak)
    assert.equal(LINE_AUDIT_SYSTEM_PROMPT.toLowerCase().includes(leak), false, leak)
  }
  assert.match(body, /proposal_rows/)
  assert.match(body, /"grid"/)
})

test("runLineAudit persists mocked rows and skips without a client", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(JCD, profiles, { skipAva: true })
  assert.equal(review.proposal?.line_items.length, 95)
  const shapes = await detectWorkbookShapesFromFile(JCD)
  const shape = shapes.find((s) => s.sheet_name === review.sheet_name) ?? shapes[0]!
  const agreeing = auditRowsFromProposal(review.proposal!)
  assert.equal(agreeing.length, 95)
  const client = mockClient(agreeing)
  const audit = await runLineAudit({
    shape,
    proposal: review.proposal!,
    client,
  })
  assert.equal(audit.status, "complete")
  assert.equal(audit.chunks, 7)
  assert.equal(audit.rows.length, 95)
  assert.ok(audit.rows.some((r) => r.row === 62))
  const skipped = skippedLineAudit("no client")
  assert.equal(skipped.status, "skipped")
  assert.equal(skipped.rows.length, 0)
})

test("stageIngestReviewFromBuffer persists line_audit on the stage", async () => {
  const profiles = loadSeedPublisherProfiles()
  const buf = await readFile(JCD)
  const preview = await buildIngestReviewFromFile(JCD, profiles, { skipAva: true })
  const client = mockClient(auditRowsFromProposal(preview.proposal!))
  const staged = await stageIngestReviewFromBuffer(Buffer.from(buf), {
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: "luke@assembledmedia.com.au",
    profiles,
    lineAuditClient: client,
  })
  assert.equal(staged.review.line_audit?.status, "complete")
  assert.equal(staged.review.line_audit?.rows.length, 95)
  const stored = await getIngestStage(staged.stageId)
  assert.ok(stored)
  assert.equal(stored!.review.line_audit?.rows.length, 95)
  assert.equal(
    sourceRowNumber(
      preview.proposal!.line_items.find((li) =>
        li.panels[0]?.source_row_ref?.endsWith("!r62"),
      )?.panels[0]?.source_row_ref,
    ),
    62,
  )
})
