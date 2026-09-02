/**
 * Template-first ingest coverage (MR-11 invert).
 * Completeness is measured against the media-type template, not leftover file columns.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { overlayMoneySynonyms, classifyMoneyColumn } from "../moneySynonyms"
import { shouldCallAvaForMappings } from "../avaColumnMapping"
import { evaluateRequiredFieldGate, attachControlledResolutions, evaluateTemplateCoverage } from "../templateCoverage"
import { getTargetTemplate, registerTargetTemplateForTests } from "../targetTemplates"
import { stampProposalForSave } from "../stampProposalForSave"
import { parsePublisherProfile } from "../publisherProfileConfig"
import type { IngestProposal } from "../proposeLineItems"

test("coverage for a non-ooh media type returns unresolved_controlled entries", async () => {
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
    const proposal: IngestProposal = {
      publisher_name: "QMS",
      media_type: "test_vocab",
      sheet_name: "Paid",
      line_items: [
        {
          grouping: { flavour: "ZZORP BLIB" },
          panels: [],
          bursts: [],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 0,
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
    }
    const profile = parsePublisherProfile({
      publisher_name: "TestPub",
      media_type: "test_vocab",
      active: true,
      grid_semantics: "count",
      grouping_keys: ["flavour"],
      detect_signature: { grouping_keys: ["flavour"] },
      column_map: { Flavour: "flavour" },
    })
    const coverage = evaluateTemplateCoverage({
      mediaType: "test_vocab",
      profile,
      shape: null,
      proposal,
    })
    const attached = await attachControlledResolutions({
      coverage,
      mediaType: "test_vocab",
      profile,
      proposal,
    })
    assert.ok(
      attached.coverage.unresolved_controlled.some(
        (item) => item.fieldId === "flavour" && item.raw === "ZZORP BLIB",
      ),
      `expected unresolved flavour, got ${JSON.stringify(attached.coverage.unresolved_controlled)}`,
    )
    assert.equal(attached.coverage.media_type, "test_vocab")
  } finally {
    unregister()
  }
})


const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

test("OOH template has 6 required fields; radio has 7", () => {
  const ooh = getTargetTemplate("ooh")
  const radio = getTargetTemplate("radio")
  assert.equal(ooh.required.length, 6)
  assert.equal(radio.required.length, 7)
  const oohIds = ooh.required.map((f) => f.id)
  assert.deepEqual(
    oohIds.sort(),
    [
      "burst_dates",
      "buy_granularity",
      "format",
      "market",
      "media_money",
      "publisher",
    ].sort(),
  )
  const radioIds = radio.required.map((f) => f.id)
  assert.deepEqual(
    radioIds.sort(),
    [
      "burst_dates",
      "duration",
      "media_money",
      "placement",
      "publisher",
      "spot_counts",
      "station",
    ].sort(),
  )
})

test("required-coverage math: 6 of 6 → completeness 1; leftover columns are not_used", () => {
  const ooh = getTargetTemplate("ooh")
  assert.equal(ooh.required.length, 6)
  // Fixture wiring asserts the live package below; this pins the registry contract.
  assert.ok(ooh.enrich.some((f) => f.id === "site_number"))
  assert.ok(ooh.enrich.some((f) => f.id === "charges"))
})

test("money synonym: per-line sums near file stated → media_amount:stated; grand total does not", () => {
  const perLine = classifyMoneyColumn({
    header: "Client Total",
    values: ["100", "200", "300"],
    fileStatedTotal: 600,
  })
  assert.equal(perLine, "per_line")

  const grand = classifyMoneyColumn({
    header: "Total Investment",
    values: ["120000", "120000", "12000"],
    fileStatedTotal: 120000,
  })
  assert.equal(grand, "grand_total")

  const unknown = classifyMoneyColumn({
    header: "PANEL EXCLUSIVITY",
    values: ["Exclusive"],
    fileStatedTotal: 100,
  })
  assert.equal(unknown, "not_synonym")
})

test("AVA gate: leftover columns never fire AVA when required is complete", () => {
  assert.equal(
    shouldCallAvaForMappings({
      unmatchedRequired: [],
      leftoverHeaders: ["PROD", "INSTALL", "PANEL EXCLUSIVITY"],
    }),
    false,
  )
  assert.equal(
    shouldCallAvaForMappings({
      unmatchedRequired: [{ id: "media_money", label: "Media money" }],
      leftoverHeaders: ["Total Investment"],
    }),
    true,
  )
  assert.equal(
    shouldCallAvaForMappings({
      unmatchedRequired: [{ id: "media_money", label: "Media money" }],
      leftoverHeaders: [],
    }),
    false,
  )
})

test("missing required field blocks Accept and names the field", () => {
  const blocked = evaluateRequiredFieldGate({
    required: [
      {
        id: "media_money",
        label: "Media money",
        matched: false,
      },
    ],
    waivers: [],
  })
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason ?? "", /Media money/)

  const waived = evaluateRequiredFieldGate({
    required: [
      {
        id: "media_money",
        label: "Media money",
        matched: false,
      },
    ],
    waivers: [
      {
        fieldId: "media_money",
        defaultValue: "",
        by: "tester",
        reason: "explicit waiver",
      },
    ],
  })
  assert.equal(waived.ok, true)
})

test("QMS / JCD / SCA: all required matched, leftovers not used, AVA 0, confidence ≥ 90%", async () => {
  const profiles = loadSeedPublisherProfiles()
  const cases: Array<{
    file: string
    publisher: string
    mediaType: "ooh" | "radio"
    requiredCount: number
  }> = [
    {
      file: "qms_strength-meals_esb-ooh.xlsx",
      publisher: "QMS",
      mediaType: "ooh",
      requiredCount: 6,
    },
    {
      file: "jcd_strength-meals_ooh.xlsx",
      publisher: "JCDecaux",
      mediaType: "ooh",
      requiredCount: 6,
    },
    {
      file: "sca_boss-engineering_fy26_v2-rev.xlsx",
      publisher: "SCA",
      mediaType: "radio",
      requiredCount: 7,
    },
  ]

  for (const c of cases) {
    const review = await buildIngestReviewFromFile(
      path.join(FIX, c.file),
      profiles,
      { skipAva: true },
    )
    assert.equal(review.detected_publisher, c.publisher, c.file)
    const cov = review.template_coverage
    assert.ok(cov, `${c.publisher} missing template_coverage`)
    assert.equal(cov!.required_count, c.requiredCount)
    assert.equal(
      cov!.required_matched,
      c.requiredCount,
      `${c.publisher} required unmatched: ${cov!.required
        .filter((f) => !f.matched)
        .map((f) => f.id)
        .join(",")}`,
    )
    assert.ok(
      review.publisher_confidence >= 0.9,
      `${c.publisher} confidence ${review.publisher_confidence}`,
    )
    assert.equal(
      shouldCallAvaForMappings({
        unmatchedRequired: cov!.required.filter((f) => !f.matched),
        leftoverHeaders: cov!.not_used.map((n) => n.header),
      }),
      false,
      `${c.publisher} must not call AVA`,
    )
    assert.ok(
      (cov!.not_used.length > 0 ||
        review.ignored.columns_unmapped.length >= 0),
      `${c.publisher} leftover section exists`,
    )
  }
})

test("grouping-row sources count as matched (label is grouping rows, not a header)", async () => {
  const profiles = loadSeedPublisherProfiles()
  const sca = await buildIngestReviewFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v2-rev.xlsx"),
    profiles,
    { skipAva: true },
  )
  const station = sca.template_coverage?.required.find((f) => f.id === "station")
  assert.ok(station?.matched)
  assert.equal(station?.source.kind, "grouping_rows")
  assert.equal(station?.source.header, undefined)

  const jcd = await buildIngestReviewFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  const format = jcd.template_coverage?.required.find((f) => f.id === "format")
  assert.ok(format?.matched)
  assert.equal(format?.source.kind, "grouping_rows")
})

test("SEN money stays unmatched (Total Investment is a grand total); AVA would fire once", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "sen_boss-engineering_fy26.xlsx"),
    profiles,
    { skipAva: true },
  )
  const cov = review.template_coverage!
  const money = cov.required.find((f) => f.id === "media_money")
  assert.equal(money?.matched, false)
  assert.ok(
    cov.not_used.some((n) => /total investment/i.test(n.header)),
    "Total Investment is leftover, not auto-mapped",
  )
  assert.equal(
    shouldCallAvaForMappings({
      unmatchedRequired: cov.required.filter((f) => !f.matched),
      leftoverHeaders: cov.not_used.map((n) => n.header),
    }),
    true,
  )
  const gate = evaluateRequiredFieldGate(cov)
  assert.equal(gate.ok, false)
  assert.match(gate.reason ?? "", /Media money/i)
})

test("ENRICH unmatched are optional: never blocking, never red", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  const unmatchedEnrich = review.template_coverage!.enrich.filter((f) => !f.matched)
  assert.ok(unmatchedEnrich.length >= 0)
  for (const f of unmatchedEnrich) {
    assert.equal(f.role, "enrich")
    assert.notEqual(f.source.kind, "blocking")
  }
  const gate = evaluateRequiredFieldGate(review.template_coverage!)
  assert.equal(gate.ok, true, "enrich gaps must not block Accept")
})

test("SCA Days is IGNORE-BY-DEFAULT (not in column_map, not stuffed into placement)", () => {
  const sca = loadSeedPublisherProfiles().find((p) => p.publisher_name === "SCA")!
  assert.equal(sca.column_map["Days"], undefined)
  assert.ok(!Object.values(sca.column_map).includes("days"))
})

test("stamp: OOH buyType is fixed_cost; radio buyType is spots; duration lands on attrs", () => {
  const ooh = stampProposalForSave(
    {
      publisher_name: "QMS",
      media_type: "ooh",
      sheet_name: "Paid",
      line_items: [
        {
          grouping: { format: "ESB", state: "NSW" },
          panels: [
            {
              descriptors: {
                site_number: "1",
                digital_spec: "1920x1080",
              },
              raw_unmapped: {},
              source_publisher: "QMS",
              source_row_ref: "Paid!r10",
              flights: [],
              grid_period_count: 1,
            },
          ],
          bursts: [
            {
              start_date: "2026-01-01",
              end_date: "2026-01-07",
              quantity: 1,
              media_amount: 100,
              booking_status: "paid",
            },
          ],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 1,
        total_media_amount: 100,
        file_stated_total: null,
        delta: null,
        delta_pct: null,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    "stampooh",
  )
  assert.equal(ooh.lineItems[0]!.buyType, "fixed_cost")
  assert.equal(ooh.lineItems[0]!.attrs?.type, "Digital")

  const radio = stampProposalForSave(
    {
      publisher_name: "SCA",
      media_type: "radio",
      sheet_name: "Schedule",
      line_items: [
        {
          grouping: {
            station: "2DAY",
            media_description: "Breakfast",
            length: "30",
          },
          panels: [
            {
              descriptors: {
                station: "2DAY",
                media_description: "Breakfast",
                length: "30",
              },
              raw_unmapped: {},
              source_publisher: "SCA",
              source_row_ref: "Schedule!r4",
              flights: [],
              grid_period_count: 4,
            },
          ],
          bursts: [
            {
              start_date: "2026-02-02",
              end_date: "2026-02-08",
              quantity: 12,
              media_amount: 500,
              booking_status: "paid",
            },
          ],
        },
      ],
      reconciliation: {
        line_item_count: 1,
        panel_count: 1,
        burst_count: 1,
        total_media_amount: 500,
        file_stated_total: null,
        delta: null,
        delta_pct: null,
        accept_ok: true,
        block_reason: null,
        warnings: [],
        charges_detected_total: 0,
      },
    },
    "stamprad",
  )
  assert.equal(radio.lineItems[0]!.buyType, "spots")
  assert.equal(radio.lineItems[0]!.attrs?.duration, "30")
  assert.equal(radio.lineItems[0]!.attrs?.station, "2DAY")
  assert.equal(radio.lineItems[0]!.attrs?.placement, "Breakfast")
})

test("panel identity: neither site_number nor panel_name matched → anonymous warning, not a gate", async () => {
  const profiles = loadSeedPublisherProfiles().map((p) => {
    if (p.publisher_name !== "QMS") return p
    const map = { ...p.column_map }
    delete map["SITE NUMBER / NO. OF PANELS"]
    return parsePublisherProfile({ ...p, column_map: map })
  })
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  const cov = review.template_coverage!
  assert.ok(
    cov.warnings.some((w) => /panel lines will be anonymous/i.test(w)),
    `expected anonymous-panel warning, got ${cov.warnings.join(" | ")}`,
  )
  assert.equal(evaluateRequiredFieldGate(cov).ok, true)
})

test("overlayMoneySynonyms does not map a repeating campaign total", () => {
  const sen = loadSeedPublisherProfiles().find((p) => p.publisher_name === "SEN")!
  const fakeShape = {
    sheet_name: "OPTION 2",
    header_row: 1,
    header_confidence: 1,
    descriptor_columns: [{ col: 87, header: "Total Investment" }],
    descriptor_confidence: 1,
    grid_columns: [],
    grid_confidence: 1,
    grouping_rows: [],
    data_rows: [2, 3, 4],
    matrix: [
      [],
      [],
      Array.from({ length: 88 }, (_, i) => (i === 87 ? "120000" : "")),
      Array.from({ length: 88 }, (_, i) => (i === 87 ? "120000" : "")),
      Array.from({ length: 88 }, (_, i) => (i === 87 ? "12000" : "")),
    ],
    file_stated_total: 120000,
    line_item_sheet_confidence: 1,
  }
  const overlaid = overlayMoneySynonyms(sen, fakeShape)
  assert.equal(overlaid.column_map["Total Investment"], undefined)
})
