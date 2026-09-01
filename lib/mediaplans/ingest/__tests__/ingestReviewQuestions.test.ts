import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { SKIP_ANSWER } from "@/lib/ava/chatInterviewQuestion"
import type { AvaColumnMappingProposal } from "../avaColumnMapping"
import {
  applyIngestReviewAnswers,
  formatFilteredUnusedMappingLine,
  LEAVE_UNMAPPED_OPTION,
  listFilteredUnusedMappingProposals,
  listOpenIngestReviewQuestions,
  parseMappedOption,
} from "../ingestReviewQuestions"
import type { IngestReviewPackage } from "../buildIngestReview"
import type { TemplateCoverage, TemplateFieldCoverage } from "../templateCoverage"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedOverlay,
} from "../persistColumnRemap"

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

test("parseMappedOption treats skip like Leave unmapped", () => {
  assert.equal(parseMappedOption(LEAVE_UNMAPPED_OPTION), null)
  assert.equal(parseMappedOption(SKIP_ANSWER), null)
  assert.equal(parseMappedOption("format (AVA suggestion)"), "format")
})

test("skipped mapping answer does not call remapIngestColumn and is recorded", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const review = stubReview()
  const result = await applyIngestReviewAnswers(review, [
    { questionId: "ingest:map:PANEL EXCLUSIVITY", answer: SKIP_ANSWER },
  ])
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

test("mapping cards keep unmatched required and enrich proposals and filter the rest", () => {
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
          canonicals: ["format", "publisher_format_name"],
        }),
      ],
      enrich: [
        coverageField({
          id: "site_number",
          role: "enrich",
          matched: false,
          dest: "attrs.site_number",
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
  const mapCards = questions.filter((q) => q.id.startsWith("ingest:map:"))
  assert.equal(mapCards.length, 2)
  assert.ok(mapCards.some((q) => q.id === "ingest:map:FORMAT COL"))
  assert.ok(mapCards.some((q) => q.id === "ingest:map:SITE COL"))
  assert.equal(
    mapCards.some((q) => q.id === "ingest:map:JUNK COL"),
    false,
  )
  const filtered = listFilteredUnusedMappingProposals(review)
  assert.equal(filtered.count, 1)
  assert.deepEqual(filtered.headers, ["JUNK COL"])
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
    /1 other column isn't used by AssembledView/,
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
    questions.filter((q) => q.id.startsWith("ingest:map:")).length,
    0,
  )
  const filtered = listFilteredUnusedMappingProposals(review)
  assert.equal(filtered.count, 1)
  assert.deepEqual(filtered.headers, ["FORMAT COL"])
  assert.ok(review.ignored.columns_unmapped.includes("FORMAT COL"))
})

test("filtering a proposal missing from ignored and not_used keeps the card and warns", () => {
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
    const mapCards = questions.filter((q) => q.id.startsWith("ingest:map:"))
    assert.equal(mapCards.length, 1)
    assert.equal(mapCards[0]?.id, "ingest:map:ORPHAN COL")
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
