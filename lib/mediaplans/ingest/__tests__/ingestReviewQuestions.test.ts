import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { SKIP_ANSWER, OTHER_OPTION } from "@/lib/ava/chatInterviewQuestion"
import type { AvaColumnMappingProposal } from "../avaColumnMapping"
import {
  applyIngestReviewAnswers,
  CONSTANT_VALUE_OPTION,
  formatFilteredUnusedMappingLine,
  formatUnmatchedNonCardFieldsLine,
  LEAVE_UNMAPPED_OPTION,
  NOT_IN_THIS_FILE_OPTION,
  listFilteredUnusedMappingProposals,
  listOpenIngestReviewQuestions,
  MONEY_RECONCILE_QUESTION_ID,
  parseMappedOption,
  valueQuestionId,
} from "../ingestReviewQuestions"
import type { IngestProposal, ProposedPanel } from "../proposeLineItems"
import type { IngestReviewPackage } from "../buildIngestReview"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { parsePublisherProfile } from "../publisherProfileConfig"
import {
  getTargetTemplate,
  listTargetTemplateMediaTypes,
  registerTargetTemplateForTests,
} from "../targetTemplates"
import {
  evaluateRequiredFieldGate,
  type TemplateCoverage,
  type TemplateFieldCoverage,
} from "../templateCoverage"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedOverlay,
  profilesWithRemapOverlay,
  registerPublisherProfileOverlay,
} from "../persistColumnRemap"
import { clearValueSynonymOverlayForTests } from "../valueSynonymRepo"
import path from "node:path"

const TEST_IDENTITY = {
  changedBy: "luke@assembledmedia.com.au",
  stageId: "11111111-1111-4111-8111-111111111111",
}

function coverageField(
  field: Pick<TemplateFieldCoverage, "id" | "role" | "matched" | "dest"> &
    Partial<TemplateFieldCoverage>,
): TemplateFieldCoverage {
  return {
    label: field.label ?? field.id,
    source: { kind: field.matched ? "header" : "unmatched" },
    confidence: field.matched ? 1 : 0,
    canonicals: field.canonicals,
    ...field,
  }
}

function stubCoverage(
  overrides: Partial<TemplateCoverage> &
    Pick<TemplateCoverage, "required" | "enrich" | "not_used">,
): TemplateCoverage {
  return {
    media_type: "ooh",
    required_matched: overrides.required.filter((f) => f.matched).length,
    required_count: overrides.required.length,
    completeness: 0,
    grid: { resolved: 0, total: 0, unresolved_headers: [] },
    warnings: [],
    waivers: [],
    unresolved_controlled: [],
    resolved_controlled: [],
    ...overrides,
  }
}

function mappingProposal(
  header: string,
  proposed_mapped_to: string | null,
): AvaColumnMappingProposal {
  return {
    header,
    sample_values: ["x"],
    proposed_mapped_to,
    reasoning: "test",
  }
}

function stubReview(overrides: Partial<IngestReviewPackage> = {}): IngestReviewPackage {
  return {
    detected_publisher: "QMS",
    publisher_confidence: 1,
    match_reasons: [],
    profile: null,
    sheet_name: "Sheet1",
    column_mapping: [
      {
        header: "PANEL EXCLUSIVITY",
        mapped_to: null,
        unmapped: true,
      },
    ],
    proposal: null,
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: ["PANEL EXCLUSIVITY"],
      spoken: [],
    },
    ava_mapping_proposals: [],
    ava_call_count: 0,
    unmapped_column_samples: [],
    template_coverage: null,
    detected_media_type: "ooh",
    media_type_status: "detected",
    needs_catalogue_choice: false,
    source_file_name: "qms.xlsx",
    sheets: [],
    ...overrides,
  }
}

test("parseMappedOption treats skip, Leave unmapped, Not in this file, and Other as no mapping", () => {
  assert.equal(parseMappedOption(LEAVE_UNMAPPED_OPTION), null)
  assert.equal(parseMappedOption(NOT_IN_THIS_FILE_OPTION), null)
  assert.equal(parseMappedOption(SKIP_ANSWER), null)
  assert.equal(parseMappedOption(OTHER_OPTION), null)
  assert.equal(parseMappedOption("format (AVA suggestion)"), "format")
})

test("skipped mapping answer does not call remapIngestColumn and is recorded", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = stubReview()
  const result = await applyIngestReviewAnswers(
    review,
    [
      { questionId: "ingest:map:PANEL EXCLUSIVITY", answer: SKIP_ANSWER },
    ],
    TEST_IDENTITY,
  )
  assert.equal(getPublisherProfileSeedOverlay().size, 0)
  assert.equal(
    result.review.ava_chat?.answers?.["ingest:map:PANEL EXCLUSIVITY"],
    SKIP_ANSWER,
  )
  const mapping = result.review.column_mapping.find(
    (row) => row.header === "PANEL EXCLUSIVITY",
  )
  assert.equal(mapping?.mapped_to, null)
  assert.equal(mapping?.unmapped, true)
})

function sortUnmatchedOnCard(ids: string[], cardIds: string[]): string[] {
  const want = new Set(ids)
  return cardIds.filter((id) => want.has(id))
}

test("field cards walk unmatched card_field_ids only; leftover columns are not cards", () => {
  const review = stubReview({
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: ["FORMAT COL", "SITE COL", "JUNK COL"],
      spoken: [],
    },
    ava_mapping_proposals: [
      mappingProposal("FORMAT COL", "format"),
      mappingProposal("SITE COL", "site_number"),
      mappingProposal("JUNK COL", "orientation"),
    ],
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: false,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format", "publisher_format_name"],
        }),
      ],
      enrich: [
        coverageField({
          id: "site_number",
          role: "enrich",
          matched: false,
          dest: "attrs.site_number",
          label: "Site number",
          canonicals: ["site_number"],
        }),
      ],
      not_used: [
        { header: "FORMAT COL" },
        { header: "SITE COL" },
        { header: "JUNK COL" },
      ],
    }),
  })
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.equal(questions.some((q) => q.id.startsWith("ingest:map:")), false)
  assert.equal(questions.some((q) => q.id.startsWith("ingest:money:")), false)
  assert.deepEqual(
    questions.map((q) => q.id),
    ["ingest:required:format"],
  )
  assert.match(questions[0]!.text, /Which column in this schedule holds Format/)
  assert.equal(questions[0]!.options?.[0], "FORMAT COL (AVA suggestion)")
  assert.ok(questions[0]!.options?.includes(NOT_IN_THIS_FILE_OPTION))
  assert.ok(questions[0]!.options?.includes(OTHER_OPTION))
  assert.equal(
    questions.some((q) => /JUNK COL/.test(q.text) && q.id.startsWith("ingest:")),
    false,
  )
  assert.equal(
    questions.some((q) => q.id === "ingest:required:site_number"),
    false,
  )
  const filtered = listFilteredUnusedMappingProposals(review)
  assert.equal(filtered.count, 2)
  assert.deepEqual(filtered.headers, ["SITE COL", "JUNK COL"])
  for (const header of filtered.headers) {
    assert.ok(
      review.ignored.columns_unmapped.some(
        (h) => h.replace(/\s+/g, " ").trim().toLowerCase() ===
          header.replace(/\s+/g, " ").trim().toLowerCase(),
      ),
      `filtered column missing from ignored: ${header}`,
    )
  }
  assert.match(
    formatFilteredUnusedMappingLine(filtered) ?? "",
    /2 other columns aren't used by AssembledView/,
  )
  assert.match(
    formatUnmatchedNonCardFieldsLine(review) ?? "",
    /Site number/,
  )
})

test("proposal for an already-matched required field is filtered", () => {
  const review = stubReview({
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: ["FORMAT COL"],
      spoken: [],
    },
    ava_mapping_proposals: [mappingProposal("FORMAT COL", "format")],
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: true,
          dest: "attrs.format",
          canonicals: ["format", "publisher_format_name"],
        }),
      ],
      enrich: [],
      not_used: [{ header: "FORMAT COL" }],
    }),
  })
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.equal(
    questions.filter((q) => q.id.startsWith("ingest:required:")).length,
    0,
  )
  assert.equal(
    questions.filter((q) => q.id.startsWith("ingest:map:")).length,
    0,
  )
  const filtered = listFilteredUnusedMappingProposals(review)
  assert.equal(filtered.count, 1)
  assert.deepEqual(filtered.headers, ["FORMAT COL"])
  assert.ok(review.ignored.columns_unmapped.includes("FORMAT COL"))
})

test("orphan unused proposal is not a card; listFilteredUnusedMappingProposals still warns", () => {
  const warn = mock.method(console, "warn", () => {})
  try {
    const review = stubReview({
      ignored: {
        sheets_skipped: [],
        rows_unparsed: 0,
        rows_unparsed_labels: [],
        columns_unmapped: [],
        spoken: [],
      },
      ava_mapping_proposals: [mappingProposal("ORPHAN COL", "orientation")],
      template_coverage: stubCoverage({
        required: [],
        enrich: [],
        not_used: [],
      }),
    })
    const questions = listOpenIngestReviewQuestions(review, {
      mbaNumber: "mba1",
      mbaNumbers: ["mba1"],
    })
    assert.equal(questions.filter((q) => q.id.startsWith("ingest:map:")).length, 0)
    assert.equal(questions.filter((q) => /ORPHAN COL/i.test(q.text)).length, 0)
    const filtered = listFilteredUnusedMappingProposals(review)
    assert.deepEqual(filtered.orphans, ["ORPHAN COL"])
    assert.ok(
      warn.mock.calls.some((call) => {
        const msg = String(call.arguments[0] ?? "")
        return msg.includes("ORPHAN COL") && msg.includes("QMS")
      }),
      "expected console.warn naming the header and publisher",
    )
  } finally {
    warn.mock.restore()
  }
})

test("unmatched required field not on the editor card is not asked", () => {
  const review = stubReview({
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: false,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format"],
        }),
        coverageField({
          id: "buy_granularity",
          role: "required",
          matched: false,
          dest: "attrs.buy_granularity",
          label: "Buy granularity",
        }),
      ],
      enrich: [],
      not_used: [{ header: "JUNK COL" }],
    }),
  })
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.deepEqual(
    questions.map((q) => q.id),
    ["ingest:required:format"],
  )
  assert.equal(
    questions.some((q) => q.id === "ingest:required:buy_granularity"),
    false,
  )
})

const JCD_FIX = path.join(process.cwd(), "tests/fixtures/ava-plans/jcd_strength-meals_ooh.xlsx")

async function jcdReview(): Promise<IngestReviewPackage> {
  return buildIngestReviewFromFile(
    JCD_FIX,
    profilesWithRemapOverlay(loadSeedPublisherProfiles()),
    {
      skipAva: true,
    },
  )
}

test("JCD fixture: cards only for unmatched required/enrich in card order; no column-first or per-column money cards", async () => {
  const review = await jcdReview()
  const cov = review.template_coverage
  assert.ok(cov)
  const cardIds = getTargetTemplate("ooh").card_field_ids
  const requiredUnmatched = cov.required.filter((f) => !f.matched).map((f) => f.id)
  const enrichUnmatched = cov.enrich.filter((f) => !f.matched).map((f) => f.id)
  const expected = sortUnmatchedOnCard(
    [...requiredUnmatched, ...enrichUnmatched],
    cardIds,
  ).map((id) => `ingest:required:${id}`)

  const ignoredUnmapped = [...review.ignored.columns_unmapped]
  const notUsed = [...(cov.not_used ?? [])]
  const recon = review.proposal!.reconciliation
  const lineCount = recon.line_item_count
  const mediaTotal = recon.total_media_amount
  const fileTotal = recon.file_stated_total

  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "jcd001",
    mbaNumbers: ["jcd001"],
  })

  assert.deepEqual(questions.map((q) => q.id), expected)
  assert.equal(questions.some((q) => q.id.startsWith("ingest:map:")), false)
  assert.equal(questions.some((q) => q.id.startsWith("ingest:money:")), false)
  assert.equal(
    questions.some((q) => /Production Charge|MEDIA BOUGHT RATE/i.test(q.text)),
    false,
  )
  for (const q of questions) {
    const fieldId = q.id.slice("ingest:required:".length)
    const field = [...cov.required, ...cov.enrich].find((f) => f.id === fieldId)
    assert.ok(field, `unexpected card ${q.id}`)
    assert.ok(q.text.startsWith(`Which column in this schedule holds ${field.label}`))
    assert.ok(q.options?.includes(NOT_IN_THIS_FILE_OPTION))
    assert.ok(q.options?.includes(OTHER_OPTION))
  }

  assert.deepEqual(review.ignored.columns_unmapped, ignoredUnmapped)
  assert.deepEqual(cov.not_used, notUsed)
  assert.equal(review.proposal!.reconciliation.line_item_count, lineCount)
  assert.equal(review.proposal!.reconciliation.total_media_amount, mediaTotal)
  assert.equal(review.proposal!.reconciliation.file_stated_total, fileTotal)
  assert.equal(lineCount, 95)
  assert.ok(fileTotal != null && Math.abs(fileTotal - 311707.88) < 1)
  assert.equal(recon.accept_ok, true)
  assert.equal(cov.unresolved_controlled.length, 0)
  assert.equal(questions.some((q) => q.id.startsWith("ingest:value:")), false)
})

test("JCD reconciling file produces zero money cards", async () => {
  const review = await jcdReview()
  assert.equal(review.proposal?.reconciliation.accept_ok, true)
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "jcd001",
    mbaNumbers: ["jcd001"],
  })
  assert.equal(questions.filter((q) => q.id.startsWith("ingest:money:")).length, 0)
})

test("file that fails the money gate produces exactly one recon card", async () => {
  const review = await jcdReview()
  assert.ok(review.proposal)
  const patched: IngestReviewPackage = {
    ...review,
    proposal: {
      ...review.proposal,
      reconciliation: {
        ...review.proposal.reconciliation,
        accept_ok: false,
        delta: 5000,
        delta_pct: 0.016,
      },
    },
  }
  const questions = listOpenIngestReviewQuestions(patched, {
    mbaNumber: "jcd001",
    mbaNumbers: ["jcd001"],
  })
  const money = questions.filter((q) => q.id.startsWith("ingest:money:"))
  assert.equal(money.length, 1)
  assert.equal(money[0]?.id, MONEY_RECONCILE_QUESTION_ID)
  assert.match(money[0]!.text, /off by/)
  assert.match(money[0]!.text, /Which column feeds Media money/)
  assert.ok(money[0]!.options && money[0]!.options.length > 2)
  assert.ok(money[0]!.options.includes(LEAVE_UNMAPPED_OPTION))
  assert.ok(money[0]!.options.includes(OTHER_OPTION))
})

test("file missing Format still asks for Format", async () => {
  const review = await jcdReview()
  const cov = review.template_coverage!
  const patched: IngestReviewPackage = {
    ...review,
    template_coverage: {
      ...cov,
      required: cov.required.map((f) =>
        f.id === "format" ? { ...f, matched: false } : f,
      ),
    },
  }
  const questions = listOpenIngestReviewQuestions(patched, {
    mbaNumber: "jcd001",
    mbaNumbers: ["jcd001"],
  })
  const format = questions.find((q) => q.id === "ingest:required:format")
  assert.ok(format, "expected a Format card")
  assert.match(format.text, /Which column in this schedule holds Format/)
  assert.equal(questions[0]?.id, "ingest:required:format")
})

test("unresolvable format is a value card offering AV options, not a column-source card", () => {
  const raw = "ZZORP BLIB"
  const review = stubReview({
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        {
          grouping: { format: raw, market: "Sydney" },
          panels: [
            {
              descriptors: { format: raw, market: "Sydney" },
              raw_unmapped: {},
              source_publisher: "QMS",
              source_row_ref: "Paid!r2",
              flights: [],
              grid_period_count: 1,
            },
          ],
          bursts: [
            {
              start_date: "2026-08-01",
              end_date: "2026-08-31",
              quantity: 1,
              media_amount: 10,
              booking_status: "paid",
            },
          ],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 1,
        total_media_amount: 10,
        file_stated_total: 10,
        delta: 0,
        delta_pct: 0,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: true,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format", "publisher_format_name"],
          source: { kind: "grouping_rows", sample: raw },
        }),
      ],
      enrich: [],
      not_used: [],
      unresolved_controlled: [
        {
          fieldId: "format",
          label: "Format",
          raw,
          vocabulary: "ooh_format",
          suggestion: null,
        },
      ],
    }),
  })
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.equal(questions.some((q) => q.id === "ingest:required:format"), false)
  const value = questions.find((q) => q.id === valueQuestionId("format", raw))
  assert.ok(value, "expected a value-resolution card")
  assert.equal(
    value.text,
    "The source says ZZORP BLIB — which of our formats is that?",
  )
  assert.deepEqual(value.options?.slice(0, 7), [
    "Active",
    "Large Format",
    "Retail",
    "Small Format",
    "Street Furniture",
    "Transit",
    "Other",
  ])
  assert.ok(value.options?.includes(LEAVE_UNMAPPED_OPTION))
  assert.ok(value.options?.includes(OTHER_OPTION))
})

test("answering a value card writes the AV canonical in-session and does not persist a column remap", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const raw = "ZZORP BLIB"
  const review = stubReview({
    detected_publisher: "QMS",
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        {
          grouping: { format: raw, market: "Sydney" },
          panels: [
            {
              descriptors: { format: raw },
              raw_unmapped: {},
              source_publisher: "QMS",
              source_row_ref: "Paid!r2",
              flights: [],
              grid_period_count: 1,
            },
          ],
          bursts: [],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 0,
        total_media_amount: 0,
        file_stated_total: null,
        delta: null,
        delta_pct: null,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: true,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format", "publisher_format_name"],
          source: { kind: "grouping_rows", sample: raw },
        }),
      ],
      enrich: [],
      not_used: [],
      unresolved_controlled: [
        {
          fieldId: "format",
          label: "Format",
          raw,
          vocabulary: "ooh_format",
          suggestion: null,
        },
      ],
    }),
  })
  const result = await applyIngestReviewAnswers(
    review,
    [
      { questionId: valueQuestionId("format", raw), answer: "Large Format" },
    ],
    TEST_IDENTITY,
  )
  assert.equal(getPublisherProfileSeedOverlay().size, 0)
  assert.equal(result.review.proposal?.line_items[0]?.grouping.format, "large_format")
  assert.equal(
    result.review.proposal?.line_items[0]?.grouping.publisher_format_name,
    raw,
  )
  assert.equal(
    result.review.proposal?.line_items[0]?.panels[0]?.descriptors.format,
    "large_format",
  )
  const still = listOpenIngestReviewQuestions(result.review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.equal(still.some((q) => q.id.startsWith("ingest:value:format:")), false)
})

test("QMS Digital produces a value-resolution card offering AV options", async () => {
  clearValueSynonymOverlayForTests()
  const review = await buildIngestReviewFromFile(
    path.join(process.cwd(), "tests/fixtures/ava-plans/qms_strength-meals_esb-ooh.xlsx"),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok((review.template_coverage?.unresolved_controlled.length ?? 0) > 0)
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "qms001",
    mbaNumbers: ["qms001"],
  })
  assert.equal(questions.some((q) => q.id === "ingest:required:format"), false)
  const valueCards = questions.filter((q) => q.id.startsWith("ingest:value:format:"))
  assert.ok(valueCards.length >= 1)
  assert.ok(valueCards.some((q) => /Digital/i.test(q.text)))
  assert.ok(valueCards[0]!.options?.includes("Large Format"))
  assert.ok(valueCards[0]!.options?.includes("Active"))
  assert.ok(valueCards[0]!.options?.includes(LEAVE_UNMAPPED_OPTION))
})

test("a buy-type value card offers OOH buy-type labels, not format labels", () => {
  const raw = "ZZORP BUY"
  const review = stubReview({
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        {
          grouping: { buyType: raw, format: "large_format" },
          panels: [
            {
              descriptors: { buyType: raw },
              raw_unmapped: {},
              source_publisher: "QMS",
              source_row_ref: "Paid!r2",
              flights: [],
              grid_period_count: 1,
            },
          ],
          bursts: [],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 0,
        total_media_amount: 0,
        file_stated_total: null,
        delta: null,
        delta_pct: null,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: true,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format", "publisher_format_name"],
        }),
      ],
      enrich: [
        coverageField({
          id: "buyType",
          role: "enrich",
          matched: true,
          dest: "line_items.buyType",
          label: "Buy Type",
          canonicals: ["buy_type", "buyType"],
        }),
      ],
      not_used: [],
      unresolved_controlled: [
        {
          fieldId: "buyType",
          label: "Buy Type",
          raw,
          vocabulary: "ooh_buy_type",
          suggestion: null,
        },
      ],
    }),
  })
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  const value = questions.find((q) => q.id === valueQuestionId("buyType", raw))
  assert.ok(value, "expected a buy-type value card")
  assert.match(value.text, /buy types/)
  assert.ok(value.options?.includes("Fixed Cost"))
  assert.ok(value.options?.includes("Package Inclusions"))
  assert.equal(value.options?.includes("Large Format"), false)
})

test("answering a buy-type value card writes buyType, not format", async () => {
  clearPublisherProfileSeedOverlayForTests()
  clearValueSynonymOverlayForTests()
  const raw = "ZZORP BUY"
  const review = stubReview({
    detected_publisher: "QMS",
    proposal: {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        {
          grouping: { buyType: raw, format: "large_format" },
          panels: [
            {
              descriptors: { buyType: raw, format: "large_format" },
              raw_unmapped: {},
              source_publisher: "QMS",
              source_row_ref: "Paid!r2",
              flights: [],
              grid_period_count: 1,
            },
          ],
          bursts: [],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 0,
        total_media_amount: 0,
        file_stated_total: null,
        delta: null,
        delta_pct: null,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: true,
          dest: "attrs.format",
          label: "Format",
        }),
      ],
      enrich: [
        coverageField({
          id: "buyType",
          role: "enrich",
          matched: true,
          dest: "line_items.buyType",
          label: "Buy Type",
        }),
      ],
      not_used: [],
      unresolved_controlled: [
        {
          fieldId: "buyType",
          label: "Buy Type",
          raw,
          vocabulary: "ooh_buy_type",
          suggestion: null,
        },
      ],
    }),
  })
  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: valueQuestionId("buyType", raw), answer: "Fixed Cost" }],
    TEST_IDENTITY,
  )
  assert.equal(result.review.proposal?.line_items[0]?.grouping.buyType, "fixed_cost")
  assert.equal(result.review.proposal?.line_items[0]?.grouping.format, "large_format")
  assert.equal(
    result.review.proposal?.line_items[0]?.panels[0]?.descriptors.buyType,
    "fixed_cost",
  )
  assert.equal(
    result.review.proposal?.line_items[0]?.grouping.publisher_buyType_name,
    undefined,
  )
})

test("a controlled field on a non-ooh throwaway template raises a value card", () => {
  const unregister = registerTargetTemplateForTests({
    media_type: "test_vocab",
    required: [
      {
        id: "flavour",
        label: "Flavour",
        dest: "attrs.flavour",
        kind: "column",
        canonicals: ["flavour"],
        controlled: { vocabulary: "ooh_format" },
      },
    ],
    enrich: [],
    system_waivers: [],
    card_field_ids: ["flavour"],
  })
  try {
    const raw = "ZZORP FLAVOUR"
    const review = stubReview({
      detected_media_type: "test_vocab",
      template_coverage: stubCoverage({
        media_type: "test_vocab",
        required: [
          coverageField({
            id: "flavour",
            role: "required",
            matched: true,
            dest: "attrs.flavour",
            label: "Flavour",
            canonicals: ["flavour"],
          }),
        ],
        enrich: [],
        not_used: [],
        unresolved_controlled: [
          {
            fieldId: "flavour",
            label: "Flavour",
            raw,
            vocabulary: "ooh_format",
            suggestion: null,
          },
        ],
      }),
    })
    const questions = listOpenIngestReviewQuestions(review, {
      mbaNumber: "mba1",
      mbaNumbers: ["mba1"],
    })
    const value = questions.find((q) => q.id === valueQuestionId("flavour", raw))
    assert.ok(value, "expected a value card on a non-ooh template")
    assert.match(value.text, /formats/)
    assert.ok(value.options?.includes("Large Format"))
  } finally {
    unregister()
  }
})

test("JCD unmatched latitude and longitude are not cards", async () => {
  const review = await jcdReview()
  const cov = review.template_coverage
  assert.ok(cov)
  const lat = cov.enrich.find((f) => f.id === "latitude")
  const lng = cov.enrich.find((f) => f.id === "longitude")
  assert.equal(lat?.matched, false, "JCD has no latitude column — field stays unmatched")
  assert.equal(lng?.matched, false, "JCD has no longitude column — field stays unmatched")

  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "jcd001",
    mbaNumbers: ["jcd001"],
  })
  assert.equal(
    questions.some((q) => q.id === "ingest:required:latitude"),
    false,
    "latitude is not on the OOH card — do not ask",
  )
  assert.equal(
    questions.some((q) => q.id === "ingest:required:longitude"),
    false,
    "longitude is not on the OOH card — do not ask",
  )
  assert.equal(
    questions.some((q) => /Latitude|Longitude/.test(q.text) && q.id.startsWith("ingest:required:")),
    false,
  )
})

test("unmatched format is still carded first in card_field_ids order", () => {
  const review = stubReview({
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "publisher",
          role: "required",
          matched: true,
          dest: "line_items.publisher",
          label: "Network",
        }),
        coverageField({
          id: "format",
          role: "required",
          matched: false,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format"],
        }),
        coverageField({
          id: "market",
          role: "required",
          matched: true,
          dest: "line_items.market",
          label: "Market",
        }),
      ],
      enrich: [
        coverageField({
          id: "latitude",
          role: "enrich",
          matched: false,
          dest: "line_item_panels.latitude",
          label: "Latitude",
          canonicals: ["latitude"],
        }),
        coverageField({
          id: "type",
          role: "enrich",
          matched: false,
          dest: "attrs.type",
          label: "Type",
          canonicals: ["type"],
        }),
      ],
      not_used: [],
    }),
  })
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  const fieldCards = questions.filter((q) => q.id.startsWith("ingest:required:"))
  assert.equal(fieldCards[0]?.id, "ingest:required:format")
  assert.match(fieldCards[0]!.text, /Format/)
  assert.deepEqual(
    fieldCards.map((q) => q.id),
    ["ingest:required:format", "ingest:required:type"],
  )
})

test("optional fields with no source line names Latitude and Longitude", async () => {
  const review = await jcdReview()
  const line = formatUnmatchedNonCardFieldsLine(review)
  assert.ok(line, "expected a named optional-fields line, not silence")
  assert.match(line, /Latitude/)
  assert.match(line, /Longitude/)
  assert.match(line, /no source in this file/)
  assert.match(line, /stay empty/)
  assert.equal(/\b\d+\b/.test(line) && /Latitude/.test(line), true)
})

test("every template: required ids are a subset of card_field_ids", () => {
  for (const mediaType of listTargetTemplateMediaTypes()) {
    const template = getTargetTemplate(mediaType)
    const card = new Set(template.card_field_ids)
    const missing = template.required
      .filter((f) => f.kind !== "derived")
      .map((f) => f.id)
      .filter((id) => !card.has(id))
    assert.deepEqual(
      missing,
      [],
      `${mediaType}: required fields missing from card_field_ids: ${missing.join(", ")}`,
    )
  }
})

test("required field absent from card_field_ids still fails the gate and logs a warning", () => {
  const unregister = registerTargetTemplateForTests({
    media_type: "test_card_bug",
    required: [
      {
        id: "secret_sauce",
        label: "Secret sauce",
        dest: "attrs.secret_sauce",
        kind: "column",
      },
    ],
    enrich: [],
    system_waivers: [],
    card_field_ids: ["publisher"],
  })
  const warn = mock.method(console, "warn", () => {})
  try {
    const gated = evaluateRequiredFieldGate({
      media_type: "test_card_bug",
      required: [
        { id: "secret_sauce", label: "Secret sauce", matched: false },
      ],
      waivers: [],
    })
    assert.equal(gated.ok, false)
    assert.match(gated.reason ?? "", /Secret sauce/)
    assert.ok(
      warn.mock.calls.some((call) => {
        const msg = String(call.arguments[0] ?? "")
        return (
          msg.includes("secret_sauce") &&
          msg.includes("card_field_ids") &&
          msg.includes("test_card_bug")
        )
      }),
      "expected a warning naming the required field missing from card_field_ids",
    )
  } finally {
    warn.mock.restore()
    unregister()
  }
})

function stubPanel(ref: string): ProposedPanel {
  return {
    descriptors: {},
    raw_unmapped: {},
    source_publisher: "QMS",
    source_row_ref: ref,
    flights: [],
    grid_period_count: 0,
  }
}

function stubProposal(): IngestProposal {
  return {
    publisher_name: "QMS",
    media_type: "ooh",
    sheet_name: "Sheet1",
    line_items: [
      {
        grouping: {},
        panels: [stubPanel("r1"), stubPanel("r2")],
        bursts: [],
      },
      {
        grouping: {},
        panels: [stubPanel("r3"), stubPanel("r4")],
        bursts: [],
      },
    ],
    reconciliation: {
      line_item_count: 2,
      panel_count: 4,
      burst_count: 0,
      total_media_amount: 0,
      file_stated_total: 0,
      delta: 0,
      delta_pct: 0,
      accept_ok: true,
      block_reason: null,
      warnings: [],
      charges_detected_total: 0,
    },
  }
}

function unmatchedCardReview(): IngestReviewPackage {
  const seed = loadSeedPublisherProfiles().find((p) => p.publisher_name === "QMS")
  assert.ok(seed)
  return stubReview({
    detected_publisher: "QMS",
    profile: seed,
    proposal: stubProposal(),
    template_coverage: stubCoverage({
      required: [
        coverageField({
          id: "format",
          role: "required",
          matched: false,
          dest: "attrs.format",
          label: "Format",
          canonicals: ["format", "publisher_format_name"],
        }),
      ],
      enrich: [
        coverageField({
          id: "placement",
          role: "enrich",
          matched: false,
          dest: "line_item_panels.placement",
          label: "Placement",
          canonicals: ["placement"],
        }),
      ],
      not_used: [],
    }),
  })
}

test("required card Other with a non-header string is still refused and leaves the profile unchanged", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = unmatchedCardReview()
  const before = { ...review.profile!.column_map }
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  const formatCard = questions.find((q) => q.id === "ingest:required:format")
  assert.ok(formatCard)
  assert.ok(formatCard.options?.includes(CONSTANT_VALUE_OPTION))
  assert.ok(formatCard.options?.includes(OTHER_OPTION))
  assert.notEqual(CONSTANT_VALUE_OPTION, OTHER_OPTION)

  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: "ingest:required:format", answer: "Large Format" }],
    TEST_IDENTITY,
  )
  assert.deepEqual(
    getPublisherProfileSeedOverlay().get("qms")?.column_map ?? before,
    before,
  )
  assert.equal(result.review.ava_chat?.answers?.["ingest:required:format"], undefined)
  assert.match(result.changed[0] ?? "", /not a column in this schedule/)
  const still = listOpenIngestReviewQuestions(result.review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.ok(still.some((q) => q.id === "ingest:required:format"))
})

test("Use one value for every line + Large Format stamps every line and panel, never column_map", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = unmatchedCardReview()
  const beforeKeys = Object.keys(review.profile!.column_map)
  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: "ingest:constant:format", answer: "Large Format" }],
    TEST_IDENTITY,
  )
  const overlay = getPublisherProfileSeedOverlay().get("qms")
  assert.ok(overlay)
  assert.deepEqual(Object.keys(overlay.column_map).sort(), [...beforeKeys].sort())
  assert.equal(overlay.field_defaults.format, "large_format")
  const formatCov = result.review.template_coverage?.required.find((f) => f.id === "format")
  assert.equal(formatCov?.matched, true)
  assert.equal(formatCov?.source.kind, "constant")
  assert.equal(formatCov?.source.sample, "large_format")
  for (const item of result.review.proposal?.line_items ?? []) {
    assert.equal(item.grouping.format, "large_format")
    for (const panel of item.panels) {
      assert.equal(panel.descriptors.format, "large_format")
    }
  }
  const still = listOpenIngestReviewQuestions(result.review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.equal(still.some((q) => q.id === "ingest:required:format"), false)
})

test("Use one value for every line + Nonsense reopens naming valid options and writes nothing", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = unmatchedCardReview()
  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: "ingest:constant:format", answer: "Nonsense" }],
    TEST_IDENTITY,
  )
  assert.equal(getPublisherProfileSeedOverlay().get("qms")?.field_defaults.format, undefined)
  assert.equal(result.review.ava_chat?.answers?.["ingest:constant:format"], undefined)
  assert.match(result.changed[0] ?? "", /"Nonsense" is not one of our formats/)
  assert.match(result.changed[0] ?? "", /Pick one of:/)
  assert.match(result.changed[0] ?? "", /Large Format/)
  const formatCov = result.review.template_coverage?.required.find((f) => f.id === "format")
  assert.equal(formatCov?.matched, false)
  const still = listOpenIngestReviewQuestions(result.review, {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  assert.ok(still.some((q) => q.id === "ingest:required:format"))
})

test("Use one value for every line + Roadside on placement stores the text verbatim", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = unmatchedCardReview()
  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: "ingest:constant:placement", answer: "Roadside" }],
    TEST_IDENTITY,
  )
  const overlay = getPublisherProfileSeedOverlay().get("qms")
  assert.equal(overlay?.field_defaults.placement, "Roadside")
  assert.equal(overlay?.column_map.placement, undefined)
  const placement = result.review.template_coverage?.enrich.find((f) => f.id === "placement")
  assert.equal(placement?.matched, true)
  assert.equal(placement?.source.kind, "constant")
  assert.equal(placement?.source.sample, "Roadside")
  for (const item of result.review.proposal?.line_items ?? []) {
    assert.equal(item.grouping.placement, "Roadside")
    for (const panel of item.panels) {
      assert.equal(panel.descriptors.placement, "Roadside")
    }
  }
})

test("a profile carrying field_defaults.format raises no format card on the next review", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const seed = loadSeedPublisherProfiles().find((p) => p.publisher_name === "JCDecaux")
  assert.ok(seed)
  const column_map = { ...seed.column_map }
  registerPublisherProfileOverlay(
    parsePublisherProfile({
      ...seed,
      grouping_keys: seed.grouping_keys.filter((k) => k !== "format"),
      detect_signature: {
        ...seed.detect_signature,
        grouping_keys: (Array.isArray(
          (seed.detect_signature as { grouping_keys?: string[] }).grouping_keys,
        )
          ? (seed.detect_signature as { grouping_keys: string[] }).grouping_keys
          : seed.grouping_keys
        ).filter((k) => k !== "format"),
      },
      column_map,
      field_defaults: { format: "large_format" },
    }),
  )
  const review = await jcdReview()
  const formatCov = review.template_coverage?.required.find((f) => f.id === "format")
  assert.equal(formatCov?.matched, true)
  assert.equal(formatCov?.source.kind, "constant")
  assert.equal(formatCov?.source.sample, "large_format")
  const questions = listOpenIngestReviewQuestions(review, {
    mbaNumber: "jcd001",
    mbaNumbers: ["jcd001"],
  })
  assert.equal(questions.some((q) => q.id === "ingest:required:format"), false)
  assert.ok((review.proposal?.line_items.length ?? 0) > 0)
  for (const item of review.proposal?.line_items ?? []) {
    assert.equal(item.grouping.format, "large_format")
  }
})

