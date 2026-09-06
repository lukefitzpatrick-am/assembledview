/**
 * IG-11 commit 2 — parser vs audit reconcile, discrepancy cards, invariants.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import {
  auditRowsFromProposal,
  type LineAudit,
} from "../lineAudit"
import {
  AUDIT_RESOLUTION_LABEL,
  PARSER_RESOLUTION_LABEL,
  discrepancyLoadRefuseMessage,
  discrepancyQuestionId,
  invariantBreachesForLine,
  reconcileLineAudit,
  recordDiscrepancyResolution,
  unresolvedDiscrepancyRows,
} from "../lineAuditReconcile"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { listOpenIngestReviewQuestions } from "../ingestReviewQuestions"
import type { IngestProposal, ProposedLineItem } from "../proposeLineItems"
import type { IngestReviewPackage } from "../buildIngestReview"
import {
  clearIngestStageForTests,
  putIngestStage,
  patchIngestStageReview,
} from "../ingestStageStore"
import { loadIngestIntoFormTool } from "@/lib/ava/tools/loadIngestIntoForm"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import { confirmAllGreen } from "../parseReview"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const JCD = path.join(FIX, "jcd_strength-meals_ooh.xlsx")

function agreeingAudit(proposal: IngestProposal): LineAudit {
  return {
    model: "mock-audit",
    status: "complete",
    chunks: 1,
    rows: auditRowsFromProposal(proposal),
  }
}

function line(over: Partial<ProposedLineItem> & { row?: number }): ProposedLineItem {
  const row = over.row ?? 10
  return {
    grouping: { publisher_format_name: "Rail", market: "Sydney", ...(over.grouping ?? {}) },
    panels: over.panels ?? [
      {
        descriptors: { site_number: "1", panel_name: "Face" },
        raw_unmapped: {},
        source_publisher: "JCDecaux",
        source_row_ref: `Sheet!r${row}`,
        flights: [
          {
            period_start: "2026-01-01",
            period_end: "2026-01-14",
            period_count: 2,
            is_live: true,
            is_bonus: false,
          },
        ],
        grid_period_count: 2,
      },
    ],
    bursts: over.bursts ?? [
      {
        start_date: "2026-01-01",
        end_date: "2026-01-14",
        quantity: 1,
        media_amount: 100,
        booking_status: "paid",
      },
    ],
    bought_rate: over.bought_rate,
    charges_detected: over.charges_detected,
  }
}

test("JCD mocked audit that agrees with the parser is 95 green", async () => {
  const review = await buildIngestReviewFromFile(
    JCD,
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.equal(review.proposal?.line_items.length, 95)
  const audit = reconcileLineAudit(review.proposal!, agreeingAudit(review.proposal!))
  assert.equal(audit.green_count, 95)
  assert.equal(audit.discrepancies?.length ?? 0, 0)
  assert.deepEqual(unresolvedDiscrepancyRows(audit), [])
})

test("wrong money on proposal r62 yields one discrepancy card naming r62", async () => {
  const review = await buildIngestReviewFromFile(
    JCD,
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const proposal = review.proposal!
  const auditRows = auditRowsFromProposal(proposal)
  const mutated: IngestProposal = {
    ...proposal,
    line_items: proposal.line_items.map((item) => {
      const ref = item.panels[0]?.source_row_ref ?? ""
      if (!ref.endsWith("!r62")) return item
      return {
        ...item,
        bought_rate: 1,
        bursts: item.bursts.map((b) =>
          b.booking_status === "paid" ? { ...b, media_amount: 1 } : b,
        ),
      }
    }),
  }
  const r62 = mutated.line_items.find((i) =>
    i.panels[0]?.source_row_ref?.endsWith("!r62"),
  )
  assert.ok(r62, "r62 is a proposed buy row")
  const audit = reconcileLineAudit(mutated, {
    model: "mock-audit",
    status: "complete",
    chunks: 1,
    rows: auditRows,
  })
  assert.equal(audit.green_count, 94)
  const money = (audit.discrepancies ?? []).filter((d) => d.field === "money")
  assert.equal(money.length, 1)
  assert.equal(money[0]!.row, 62)
  assert.match(money[0]!.source_row_ref, /r62/)
  const parserAmt = (money[0]!.parser as { amount: number }).amount
  const auditAmt = (money[0]!.audit as { amount: number }).amount
  assert.equal(parserAmt, 1)
  assert.notEqual(auditAmt, 1)
  assert.ok(auditAmt != null && auditAmt > 1)

  const pkg: IngestReviewPackage = {
    ...review,
    proposal: mutated,
    line_audit: audit,
  }
  const cards = listOpenIngestReviewQuestions(pkg, {
    mbaNumber: "glenda008",
    mbaNumbers: ["glenda008"],
  })
  const card = cards.find((q) => q.id === discrepancyQuestionId(62))
  assert.ok(card, "discrepancy card for r62")
  assert.match(card!.text, /r62/)
  assert.match(card!.text, /Parser money/)
  assert.match(card!.text, /audit money/)
  assert.ok(card!.options?.includes(PARSER_RESOLUTION_LABEL))
  assert.ok(card!.options?.includes(AUDIT_RESOLUTION_LABEL))
  assert.equal(cards.filter((q) => q.id.startsWith("ingest:discrepancy:")).length, 1)
})

test("invariant: money only on paid runs", () => {
  const item = line({
    bursts: [
      {
        start_date: "2026-01-01",
        end_date: "2026-01-07",
        quantity: 1,
        media_amount: 50,
        booking_status: "bonus",
      },
    ],
  })
  const rules = invariantBreachesForLine(item).map((b) => b.rule)
  assert.ok(rules.includes("money_only_on_paid"))
})

test("invariant: bonus $0 with its own flight", () => {
  const item = line({
    panels: [
      {
        descriptors: { site_number: "1" },
        raw_unmapped: {},
        source_publisher: "JCDecaux",
        source_row_ref: "Sheet!r10",
        flights: [
          {
            period_start: "2026-01-01",
            period_end: "2026-01-07",
            period_count: 1,
            is_live: true,
            is_bonus: true,
          },
        ],
        grid_period_count: 1,
      },
    ],
    bursts: [
      {
        start_date: "2026-01-01",
        end_date: "2026-01-07",
        quantity: 1,
        media_amount: 0,
        booking_status: "paid",
      },
    ],
  })
  const rules = invariantBreachesForLine(item).map((b) => b.rule)
  assert.ok(rules.includes("bonus_zero_own_flight"))
})

test("invariant: bursts inside status runs", () => {
  const item = line({
    bursts: [
      {
        start_date: "2027-06-01",
        end_date: "2027-06-14",
        quantity: 1,
        media_amount: 10,
        booking_status: "paid",
      },
    ],
  })
  const rules = invariantBreachesForLine(item).map((b) => b.rule)
  assert.ok(rules.includes("bursts_inside_runs"))
})

test("invariant: one section per line", () => {
  const item = line({
    grouping: { publisher_format_name: "Rail" },
    panels: [
      {
        descriptors: { publisher_format_name: "Rail", site_number: "1" },
        raw_unmapped: {},
        source_publisher: "JCDecaux",
        source_row_ref: "Sheet!r10",
        flights: [],
        grid_period_count: 0,
      },
      {
        descriptors: { publisher_format_name: "Retail", site_number: "2" },
        raw_unmapped: {},
        source_publisher: "JCDecaux",
        source_row_ref: "Sheet!r10",
        flights: [],
        grid_period_count: 0,
      },
    ],
    bursts: [],
  })
  const rules = invariantBreachesForLine(item).map((b) => b.rule)
  assert.ok(rules.includes("one_section_per_line"))
})

test("invariant: format from that section", () => {
  const item = line({
    grouping: { publisher_format_name: "Rail" },
    panels: [
      {
        descriptors: { publisher_format_name: "Retail", site_number: "1" },
        raw_unmapped: {},
        source_publisher: "JCDecaux",
        source_row_ref: "Sheet!r10",
        flights: [],
        grid_period_count: 0,
      },
    ],
    bursts: [],
  })
  const rules = invariantBreachesForLine(item).map((b) => b.rule)
  assert.ok(rules.includes("format_from_section"))
})

function withoutUnresolved(review: IngestReviewPackage): IngestReviewPackage {
  if (!review.template_coverage) return review
  return {
    ...review,
    template_coverage: {
      ...review.template_coverage,
      unresolved_controlled: [],
    },
  }
}

function loadCtx(stageId: string, fileName: string): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: undefined,
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "u1",
    userEmail: "ava@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: { stageId, fileName },
    capturedLineItemsLoad: null,
    currentLineItems: null,
  }
}

test("load refuses r62 until the discrepancy is resolved, then proceeds", async () => {
  clearIngestStageForTests()
  const review = await buildIngestReviewFromFile(
    JCD,
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const proposal = review.proposal!
  const auditRows = auditRowsFromProposal(proposal)
  const mutated: IngestProposal = {
    ...proposal,
    line_items: proposal.line_items.map((item) => {
      const ref = item.panels[0]?.source_row_ref ?? ""
      if (!ref.endsWith("!r62")) return item
      return {
        ...item,
        bought_rate: 1,
        bursts: item.bursts.map((b) =>
          b.booking_status === "paid" ? { ...b, media_amount: 1 } : b,
        ),
      }
    }),
  }
  const audit = reconcileLineAudit(mutated, {
    model: "mock-audit",
    status: "complete",
    chunks: 1,
    rows: auditRows,
  })
  const dirty = withoutUnresolved({
    ...review,
    proposal: mutated,
    line_audit: audit,
  })
  assert.deepEqual(unresolvedDiscrepancyRows(dirty.line_audit), [62])
  const stageId = await putIngestStage({
    review: dirty,
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: "ava@assembledmedia.com.au",
  })
  const refused = await loadIngestIntoFormTool.execute(
    { confirm: true },
    loadCtx(stageId, "jcd_strength-meals_ooh.xlsx"),
  )
  assert.equal(refused.isError, true)
  assert.match(refused.content, /1 line discrepancy is still open/)
  assert.equal(refused.content, discrepancyLoadRefuseMessage(1))

  const resolved = confirmAllGreen({
    review: recordDiscrepancyResolution({
      review: dirty,
      row: 62,
      answer: PARSER_RESOLUTION_LABEL,
      by: "ava@assembledmedia.com.au",
    }),
    by: "ava@assembledmedia.com.au",
  })
  assert.equal(resolved.line_audit?.resolutions?.[discrepancyQuestionId(62)]?.choice, "parser")
  assert.deepEqual(unresolvedDiscrepancyRows(resolved.line_audit), [])
  await patchIngestStageReview(stageId, resolved)
  const okCtx = loadCtx(stageId, "jcd_strength-meals_ooh.xlsx")
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, okCtx)
  assert.equal(ok.isError, false)
  assert.ok(okCtx.capturedLineItemsLoad)
  assert.ok(okCtx.capturedLineItemsLoad.items.length > 0)
})
