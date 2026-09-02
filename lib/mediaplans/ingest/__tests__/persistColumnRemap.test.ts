/**
 * IG-1 — chat answers cannot destroy or invent a publisher_profiles mapping.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import {
  applyIngestReviewAnswers,
  columnMappingActionOptions,
  LEAVE_UNMAPPED_OPTION,
  listOpenIngestReviewQuestions,
  REMOVE_MAPPING_OPTION,
  removeMappingOptionLabel,
} from "../ingestReviewQuestions"
import type { IngestReviewPackage } from "../buildIngestReview"
import type { TemplateCoverage, TemplateFieldCoverage } from "../templateCoverage"
import {
  clearPublisherProfileSeedOverlayForTests,
  getPublisherProfileSeedAuditForTests,
  getPublisherProfileSeedOverlay,
  persistColumnRemap,
  validateRemapHeader,
} from "../persistColumnRemap"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"

const TEST_IDENTITY = {
  changedBy: "luke@assembledmedia.com.au",
  source: "ava_card" as const,
  stageId: "11111111-1111-4111-8111-111111111111",
}

const JCD_HEADERS = [
  "Panel #",
  "Panel Name",
  "Production Charge",
  "Installation Charge",
  "MEDIA VALUE (inc. STA)",
  "Lunar (4 week) Market Rate",
]

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

function jcdReview(overrides: Partial<IngestReviewPackage> = {}): IngestReviewPackage {
  const seed = loadSeedPublisherProfiles().find((p) => p.publisher_name === "JCDecaux")
  assert.ok(seed)
  return {
    detected_publisher: "JCDecaux",
    publisher_confidence: 1,
    match_reasons: [],
    profile: seed,
    sheet_name: "Sheet1",
    column_mapping: JCD_HEADERS.map((header) => ({
      header,
      mapped_to: seed.column_map[header] ?? null,
      unmapped: !seed.column_map[header],
    })),
    proposal: null,
    ignored: {
      sheets_skipped: [],
      rows_unparsed: 0,
      rows_unparsed_labels: [],
      columns_unmapped: [],
      spoken: [],
    },
    ava_mapping_proposals: [],
    ava_call_count: 0,
    unmapped_column_samples: [],
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
      enrich: [],
      not_used: [],
    }),
    detected_media_type: "ooh",
    media_type_status: "detected",
    needs_catalogue_choice: false,
    source_file_name: "jcd.xlsx",
    sheets: [],
    ...overrides,
  }
}

test.beforeEach(() => {
  clearPublisherProfileSeedOverlayForTests()
})

test("validateRemapHeader hits on a whitespace/case variant and returns the original spelling", () => {
  const hit = validateRemapHeader("  production   charge ", JCD_HEADERS)
  assert.equal(hit.ok, true)
  if (hit.ok) assert.equal(hit.header, "Production Charge")
})

test('validateRemapHeader("Large Format", jcdHeaders) is rejected', () => {
  const miss = validateRemapHeader("Large Format", JCD_HEADERS)
  assert.equal(miss.ok, false)
  if (!miss.ok) {
    assert.match(miss.reason, /"Large Format" is not a column in this schedule/)
  }
})

test('ingest:required:format answered "Large Format" leaves profile unchanged and does not record', async () => {
  const review = jcdReview()
  const before = { ...review.profile!.column_map }
  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: "ingest:required:format", answer: "Large Format" }],
    TEST_IDENTITY,
  )
  assert.deepEqual(
    getPublisherProfileSeedOverlay().get("jcdecaux")?.column_map ?? before,
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

test('ingest:money:"Production Charge" answered "Leave unmapped" leaves the profile unchanged', async () => {
  const review = jcdReview()
  const result = await applyIngestReviewAnswers(
    review,
    [
      {
        questionId: "ingest:money:Production Charge",
        answer: LEAVE_UNMAPPED_OPTION,
      },
    ],
    TEST_IDENTITY,
  )
  assert.equal(getPublisherProfileSeedOverlay().size, 0)
  assert.equal(
    loadSeedPublisherProfiles().find((p) => p.publisher_name === "JCDecaux")
      ?.column_map["Production Charge"],
    "charge:production",
  )
  assert.equal(
    result.review.ava_chat?.answers?.["ingest:money:Production Charge"],
    LEAVE_UNMAPPED_OPTION,
  )
})

test('ingest:money:"Production Charge" remove mapping deletes the key and audits', async () => {
  const review = jcdReview()
  const answer = removeMappingOptionLabel("charge:production")
  const result = await applyIngestReviewAnswers(
    review,
    [{ questionId: "ingest:money:Production Charge", answer }],
    TEST_IDENTITY,
  )
  const overlay = getPublisherProfileSeedOverlay().get("jcdecaux")
  assert.ok(overlay)
  assert.equal(overlay.column_map["Production Charge"], undefined)
  const audit = getPublisherProfileSeedAuditForTests()
  assert.equal(audit.length, 1)
  assert.equal(audit[0]?.action, "remove")
  assert.equal(audit[0]?.previous_value, "charge:production")
  assert.equal(audit[0]?.next_value, null)
  assert.equal(audit[0]?.changed_by, TEST_IDENTITY.changedBy)
  assert.match(result.changed[0] ?? "", /Removed Production Charge → charge:production/)
  assert.match(result.changed[0] ?? "", /Every future upload from this publisher is affected/)
})

test("a valid remap writes the key and an audit row with both values", async () => {
  const result = await persistColumnRemap({
    publisherName: "JCDecaux",
    header: "Production Charge",
    mappedTo: "charge:installation",
    knownHeaders: JCD_HEADERS,
    ...TEST_IDENTITY,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.profile.column_map["Production Charge"], "charge:installation")
  const audit = getPublisherProfileSeedAuditForTests()
  assert.equal(audit.length, 1)
  assert.ok(audit[0]?.action === "map" || audit[0]?.action === "remap")
  assert.equal(audit[0]?.previous_value, "charge:production")
  assert.equal(audit[0]?.next_value, "charge:installation")
  assert.equal(audit[0]?.changed_by, TEST_IDENTITY.changedBy)
})

test("REMOVE_MAPPING_OPTION is not offered on a card whose header is unmapped", () => {
  const unmapped = columnMappingActionOptions(null)
  assert.equal(
    unmapped.some((o) => o.startsWith(REMOVE_MAPPING_OPTION)),
    false,
  )
  const mapped = columnMappingActionOptions("charge:production")
  assert.ok(mapped.includes(removeMappingOptionLabel("charge:production")))
})

test("REMOVE_MAPPING_OPTION is not offered on any ingest:required: card", () => {
  const questions = listOpenIngestReviewQuestions(jcdReview(), {
    mbaNumber: "mba1",
    mbaNumbers: ["mba1"],
  })
  const required = questions.filter((q) => q.id.startsWith("ingest:required:"))
  assert.ok(required.length > 0)
  for (const q of required) {
    assert.equal(
      (q.options ?? []).some((o) => o.startsWith(REMOVE_MAPPING_OPTION)),
      false,
      q.id,
    )
  }
})

test("empty knownHeaders is a rejection, not a throw", async () => {
  const rejected = await persistColumnRemap({
    publisherName: "JCDecaux",
    header: "Production Charge",
    mappedTo: "charge:production",
    knownHeaders: [],
    ...TEST_IDENTITY,
  })
  assert.equal(rejected.ok, false)
})

test("seed overlay logs an audit line and does not throw for a rejected header", async () => {
  const info = mock.method(console, "info", () => {})
  try {
    const rejected = await persistColumnRemap({
      publisherName: "JCDecaux",
      header: "Large Format",
      mappedTo: "format",
      knownHeaders: JCD_HEADERS,
      ...TEST_IDENTITY,
    })
    assert.equal(rejected.ok, false)
    if (!rejected.ok) {
      assert.deepEqual(rejected.knownHeaders, JCD_HEADERS)
    }
    assert.equal(getPublisherProfileSeedOverlay().size, 0)
    const accepted = await persistColumnRemap({
      publisherName: "QMS",
      header: "PROD",
      mappedTo: "charge:installation",
      knownHeaders: ["PROD", "INSTALL"],
      changedBy: TEST_IDENTITY.changedBy,
      source: "hub_remap",
    })
    assert.equal(accepted.ok, true)
    assert.ok(
      info.mock.calls.some((call) => String(call.arguments[0] ?? "").includes("publisher-profile-audit")),
    )
  } finally {
    info.mock.restore()
  }
})
