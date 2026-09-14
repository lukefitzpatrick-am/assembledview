/**
 * IG-11 — Parse Review decisions, load gate, RAIL synonym, invariants.
 * Model is mocked; never a live Anthropic call.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import type { IngestReviewPackage } from "../buildIngestReview"
import { auditRowsFromProposal } from "../lineAudit"
import { sourceRowNumber } from "../lineAudit"
import {
  invariantBreachesForLine,
  reconcileLineAudit,
} from "../lineAuditReconcile"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  confirmAllGreen,
  leftoverExcludedLegend,
  parseReviewCounts,
  parseReviewLoadGate,
  parseReviewOf,
  proposedSourceRows,
  recordRowDecision,
  resolveParseReviewDiscrepancy,
  siblingRowsForValue,
  tallyFieldOverride,
} from "../parseReview"
import {
  applyParseReviewOverrideProposal,
  resolveParseReviewValue,
} from "../parseReview.server"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedAuditForTests,
} from "../persistColumnRemap"
import {
  clearIngestStageForTests,
} from "../ingestStageStore"
import {
  getIngestStage,
  patchIngestStageReview,
  putIngestStage,
} from "../ingestStageStore.server"
import { loadIngestIntoFormTool } from "@/lib/ava/tools/loadIngestIntoForm"
import type { AvaToolContext } from "@/lib/ava/tools/types"
import {
  clearValueSynonymOverlayForTests,
  getValueSynonymOverlayForTests,
} from "../valueSynonymRepo"
import type { IngestProposal, ProposedLineItem } from "../proposeLineItems"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")
const JCD = path.join(FIX, "jcd_strength-meals_ooh.xlsx")
const BY = "ava@assembledmedia.com.au"

test.beforeEach(() => {
  clearIngestStageForTests()
  clearValueSynonymOverlayForTests()
  clearPublisherProfileSeedOverlayForTests()
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

function agreeing(review: IngestReviewPackage): IngestReviewPackage {
  const proposal = review.proposal!
  return {
    ...review,
    line_audit: reconcileLineAudit(proposal, {
      model: "mock-audit",
      status: "complete",
      chunks: 1,
      rows: auditRowsFromProposal(proposal),
    }),
  }
}

function loadCtx(stageId: string, fileName: string): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: "glenda008",
    versionNumber: undefined,
    enabledMediaTypes: ["ooh"],
    userSub: "u1",
    userEmail: BY,
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: ["glenda008"],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    pendingIngest: { stageId, fileName },
    capturedLineItemsLoad: null,
    currentLineItems: null,
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

test("JCD 95 agree → confirm all green → load allowed", async () => {
  const review = agreeing(
    withoutUnresolved(
      await buildIngestReviewFromFile(JCD, loadSeedPublisherProfiles(), {
        skipAva: true,
      }),
    ),
  )
  assert.equal(review.proposal?.line_items.length, 95)
  assert.equal(review.line_audit?.green_count, 95)
  const counts0 = parseReviewCounts(review)
  assert.equal(counts0.green_unconfirmed, 95)
  assert.equal(parseReviewLoadGate(review).ok, false)

  const confirmed = confirmAllGreen({ review, by: BY })
  const counts = parseReviewCounts(confirmed)
  assert.equal(counts.confirmed, 95)
  assert.equal(counts.needs_decision, 0)
  assert.equal(parseReviewLoadGate(confirmed).ok, true)

  const stageId = await putIngestStage({
    review: confirmed,
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: BY,
  })
  const ctx = loadCtx(stageId, "jcd_strength-meals_ooh.xlsx")
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, ctx)
  assert.equal(ok.isError, false)
  assert.equal(ctx.capturedLineItemsLoad?.items.length, 95)
})

test("wrong money on r62 → one disagree; bulk green skips it; load refused until chosen", async () => {
  const base = await buildIngestReviewFromFile(
    JCD,
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  const proposal = base.proposal!
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
  const dirty = agreeing(withoutUnresolved({ ...base, proposal: mutated }))
  const dirtyAudit = reconcileLineAudit(mutated, {
    model: "mock-audit",
    status: "complete",
    chunks: 1,
    rows: auditRows,
  })
  const pkg: IngestReviewPackage = {
    ...dirty,
    proposal: mutated,
    line_audit: dirtyAudit,
  }
  assert.equal(dirtyAudit.discrepancies?.filter((d) => d.field === "money").length, 1)
  const bulk = confirmAllGreen({ review: pkg, by: BY })
  const counts = parseReviewCounts(bulk)
  assert.equal(counts.confirmed, 94)
  assert.equal(counts.needs_decision, 1)
  assert.equal(parseReviewLoadGate(bulk).ok, false)

  const stageId = await putIngestStage({
    review: bulk,
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: BY,
  })
  const refused = await loadIngestIntoFormTool.execute(
    { confirm: true },
    loadCtx(stageId, "jcd_strength-meals_ooh.xlsx"),
  )
  assert.equal(refused.isError, true)
  assert.match(refused.content, /discrepancy|confirm or exclude/i)

  const chosen = resolveParseReviewDiscrepancy({
    review: bulk,
    row: 62,
    answer: "Parser",
    by: BY,
  })
  assert.equal(
    chosen.line_audit?.resolutions?.["ingest:discrepancy:r62"]?.choice,
    "parser",
  )
  assert.equal(parseReviewOf(chosen).decisions.r62?.status, "confirmed")
  assert.equal(parseReviewLoadGate(chosen).ok, true)

  await patchIngestStageReview(stageId, chosen)
  const okCtx = loadCtx(stageId, "jcd_strength-meals_ooh.xlsx")
  const ok = await loadIngestIntoFormTool.execute({ confirm: true }, okCtx)
  assert.equal(ok.isError, false)
  assert.ok(okCtx.capturedLineItemsLoad)
})

test("RAIL unresolved → Transit resolves 14 rows and writes one synonym", async () => {
  const review = agreeing(
    await buildIngestReviewFromFile(JCD, loadSeedPublisherProfiles(), {
      skipAva: true,
    }),
  )
  const unresolved = (review.template_coverage?.unresolved_controlled ?? []).find(
    (u) => /RAIL/i.test(u.raw),
  )
  assert.ok(unresolved, "JCD RAIL must be unresolved")
  const siblings = siblingRowsForValue(review, unresolved)
  assert.equal(siblings.length, 14)
  const railRow = siblings[0]!
  const bulk = confirmAllGreen({ review, by: BY })
  assert.equal(parseReviewCounts(bulk).needs_decision, 14)
  assert.equal(parseReviewLoadGate(bulk).ok, false)

  const stageId = await putIngestStage({
    review: bulk,
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: BY,
  })
  const resolved = await resolveParseReviewValue({
    review: bulk,
    row: railRow,
    answer: "Transit",
    by: BY,
    stageId,
  })
  assert.equal(resolved.canonical, "transit")
  assert.equal(resolved.resolvedRows.length, 14)
  assert.equal(resolved.synonymWritten, true)
  assert.equal(
    (resolved.review.template_coverage?.unresolved_controlled ?? []).filter((u) =>
      /RAIL/i.test(u.raw),
    ).length,
    0,
  )
  const syn = getValueSynonymOverlayForTests().filter((r) => r.isActive)
  assert.equal(syn.length, 1)
  assert.equal(syn[0]!.avCanonical, "transit")
  assert.match(syn[0]!.rawValue, /rail/i)

  const afterGreen = confirmAllGreen({ review: resolved.review, by: BY })
  assert.equal(parseReviewCounts(afterGreen).confirmed, 95)
  assert.equal(parseReviewLoadGate(afterGreen).ok, true)
})

test("excluded leftover rows listed with counts; excluded proposed rows drop from load", async () => {
  const review = agreeing(
    withoutUnresolved(
      await buildIngestReviewFromFile(JCD, loadSeedPublisherProfiles(), {
        skipAva: true,
      }),
    ),
  )
  const legend = leftoverExcludedLegend(review)
  assert.match(legend, /INVESTMENT/i)
  assert.match(legend, /×3/)
  const row = proposedSourceRows(review)[0]!
  let next = confirmAllGreen({ review, by: BY })
  next = recordRowDecision({
    review: next,
    row,
    status: "excluded",
    by: BY,
    note: "planner excluded",
  })
  assert.equal(parseReviewCounts(next).excluded, 1)
  assert.equal(parseReviewLoadGate(next).ok, true)
  const { ingestReviewToFormLineItems } = await import("../toFormLineItems")
  const form = ingestReviewToFormLineItems(next)
  assert.equal(form.items.length, 94)
})

test("reload restores decisions from the stage", async () => {
  const review = agreeing(
    withoutUnresolved(
      await buildIngestReviewFromFile(JCD, loadSeedPublisherProfiles(), {
        skipAva: true,
      }),
    ),
  )
  const confirmed = confirmAllGreen({ review, by: BY })
  const anyRow = proposedSourceRows(confirmed)[0]!
  const stageId = await putIngestStage({
    review: confirmed,
    fileName: "jcd_strength-meals_ooh.xlsx",
    uploadedBy: BY,
  })
  const reloaded = await getIngestStage(stageId)
  assert.ok(reloaded)
  assert.equal(parseReviewCounts(reloaded.review).confirmed, 95)
  assert.equal(
    parseReviewOf(reloaded.review).decisions[`r${anyRow}`]?.by,
    BY,
  )
})

test("invariant: campaign window flags a burst outside the MBA dates", () => {
  const item = line({
    bursts: [
      {
        start_date: "2028-01-01",
        end_date: "2028-01-14",
        quantity: 1,
        media_amount: 10,
        booking_status: "paid",
      },
    ],
  })
  const rules = invariantBreachesForLine(item, {
    start: "2026-01-01",
    end: "2026-12-31",
  }).map((b) => b.rule)
  assert.ok(rules.includes("campaign_window"))
  assert.equal(
    invariantBreachesForLine(item).some((b) => b.rule === "campaign_window"),
    false,
  )
})

test("buy type disagree when parser is paid and audit status runs are all bonus", () => {
  const item = line({})
  const proposal: IngestProposal = {
    publisher_name: "JCDecaux",
    media_type: "ooh",
    sheet_name: "Sheet",
    line_items: [item],
    reconciliation: {
      line_item_count: 1,
      panel_count: 1,
      burst_count: 1,
      total_media_amount: 100,
      file_stated_total: 100,
      delta: 0,
      delta_pct: 0,
      accept_ok: true,
      block_reason: null,
      warnings: [],
      charges_detected_total: 0,
    },
  }
  const parserRow = auditRowsFromProposal(proposal)[0]!
  const audit = reconcileLineAudit(proposal, {
    model: "mock-audit",
    status: "complete",
    chunks: 1,
    rows: [
      {
        ...parserRow,
        status_runs: [{ status: "bonus", from_col: "AA", to_col: "AG" }],
      },
    ],
  })
  assert.ok((audit.discrepancies ?? []).some((d) => d.field === "buy_type"))
})

test("recurring field override on 3 files is proposed, not applied", async () => {
  const review = {
    parse_review: { decisions: {} },
  } as IngestReviewPackage
  let next = review
  next = tallyFieldOverride({
    review: next,
    publisherName: "JCDecaux",
    header: "Suburb",
    mappedTo: "placement",
    fileName: "a.xlsx",
  })
  next = tallyFieldOverride({
    review: next,
    publisherName: "JCDecaux",
    header: "Suburb",
    mappedTo: "placement",
    fileName: "b.xlsx",
  })
  assert.equal(parseReviewOf(next).override_proposals?.length ?? 0, 0)
  next = tallyFieldOverride({
    review: next,
    publisherName: "JCDecaux",
    header: "Suburb",
    mappedTo: "placement",
    fileName: "c.xlsx",
  })
  const proposals = parseReviewOf(next).override_proposals ?? []
  assert.equal(proposals.length, 1)
  assert.equal(proposals[0]!.applied, false)
  assert.equal(proposals[0]!.file_names.length, 3)
  assert.equal(getPublisherProfileSeedAuditForTests().length, 0)

  const withHeaders = {
    ...next,
    detected_publisher: "JCDecaux",
    column_mapping: [
      {
        header: "Suburb",
        mapped_to: "market",
        unmapped: false,
        sheetName: "Paid",
      },
    ],
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: [],
      spoken: [],
    },
  } as IngestReviewPackage
  const applied = await applyParseReviewOverrideProposal({
    review: withHeaders,
    header: "Suburb",
    mappedTo: "placement",
    by: BY,
    stageId: "11111111-1111-4111-8111-111111111111",
  })
  assert.equal(applied.applied, true)
  assert.equal(parseReviewOf(applied.review).override_proposals?.[0]?.applied, true)
  const audit = getPublisherProfileSeedAuditForTests()
  assert.equal(audit.length, 1)
  assert.equal(audit[0]!.source, "parse_review")
  assert.equal(audit[0]!.header, "Suburb")
  assert.equal(audit[0]!.next_value, "placement")
})
