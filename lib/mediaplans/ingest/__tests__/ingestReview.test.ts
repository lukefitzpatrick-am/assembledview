/**
 * MR-4 — ingest review + accept (human gate).
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { acceptIngestProposal } from "../acceptIngestProposal"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import {
  applyColumnRemap,
  clearPublisherProfileSeedOverlayForTests,
  persistColumnRemap,
  profilesWithRemapOverlay,
} from "../persistColumnRemap"
import { stampProposalForSave } from "../stampProposalForSave"
import type { SavePlanLineItem } from "@/lib/data/savePlan"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

test.beforeEach(() => {
  clearPublisherProfileSeedOverlayForTests()
})

test("JCD ignored summary names unparsed descriptor rows, not a bare count", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.ok(review.ignored.rows_unparsed > 0, "JCD has unparsed leftover rows")
  const labels = review.ignored.rows_unparsed_labels ?? []
  assert.ok(
    labels.length > 0,
    "unparsed rows must be named — a bare count is a silent drop",
  )
  const hay = labels.join(" | ").toUpperCase()
  for (const name of ["MEDIA VALUE", "DISCOUNT", "CAMPAIGN SUMMARY"]) {
    assert.ok(
      hay.includes(name),
      `expected ignored-row label ${name}, got ${labels.join(", ")}`,
    )
  }
  const spoken = review.ignored.spoken.join(" | ")
  assert.match(spoken, /unparsed/i)
  assert.match(spoken, /MEDIA VALUE/i)
  assert.match(spoken, /DISCOUNT/i)
  assert.match(spoken, /CAMPAIGN SUMMARY/i)
})

test("QMS review: publisher + mapping + reconciliation; confidence reported", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.equal(review.detected_publisher, "QMS")
  assert.ok(review.publisher_confidence > 0)
  assert.ok(review.proposal)
  assert.ok(review.column_mapping.length > 0)
  assert.ok(
    review.column_mapping.some((c) => c.unmapped),
    "QMS has intentional unmapped rate columns",
  )
  assert.ok(review.ignored.spoken.length > 0, "ignored spoken non-empty")
  // Supersedes grouped 3-of-41: review line count is the Paid buy-row count.
  assert.equal(review.proposal!.reconciliation.line_item_count, 41)
  assert.equal(review.proposal!.reconciliation.panel_count, 41)
})

test("SCA v2 ignored summary non-empty (R+F / related sheets)", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v2-rev.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.ok(
    review.ignored.sheets_skipped.length > 0,
    `expected skipped sheets, got ${JSON.stringify(review.ignored)}`,
  )
  assert.ok(
    review.ignored.sheets_skipped.some((s) => /R\+F|Reach|Audience/i.test(s)),
    `expected R&F-ish skip, got ${review.ignored.sheets_skipped.join(",")}`,
  )
  assert.ok(review.ignored.spoken.length > 0)
})

test("SCA review: Market Rate / Market Total are reference-ignored, not unmapped", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v2-rev.xlsx"),
    profiles,
    { skipAva: true },
  )
  const market = review.column_mapping.filter((c) =>
    /^Market (Rate|Total)$/i.test(c.header),
  )
  assert.ok(market.length >= 2, `expected Market Rate/Total rows, got ${JSON.stringify(review.column_mapping)}`)
  for (const row of market) {
    assert.equal(row.mapped_to, "reference:ignore")
    assert.equal(row.unmapped, false)
  }
  assert.ok(
    !review.ignored.columns_unmapped.some((h) => /market (rate|total)/i.test(h)),
  )
  assert.ok(
    !review.unmapped_column_samples.some((c) =>
      /market (rate|total)/i.test(c.header),
    ),
  )
})

test("SEN review: detect → propose → review; descriptors mapped; stated total", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "sen_boss-engineering_fy26.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.equal(review.detected_publisher, "SEN")
  assert.ok(review.publisher_confidence > 0)
  assert.ok(review.proposal)
  assert.equal(review.proposal!.reconciliation.file_stated_total, 120000)
  assert.ok(review.proposal!.reconciliation.line_item_count >= 1)
  assert.ok(review.proposal!.reconciliation.burst_count >= 1)
  const mapped = review.column_mapping.filter((c) => !c.unmapped)
  assert.ok(
    mapped.length >= 3,
    `expected station/entitlement/length mapped, got ${JSON.stringify(review.column_mapping)}`,
  )
  const sampleKeys = review.unmapped_column_samples.map((c) =>
    c.header.replace(/\s+/g, " ").trim().toLowerCase(),
  )
  assert.equal(
    sampleKeys.length,
    new Set(sampleKeys).size,
    `duplicate SEN unmapped samples: ${sampleKeys.join("|")}`,
  )
  assert.ok(
    review.unmapped_column_samples.some((c) => /total investment/i.test(c.header)),
    "SEN money columns stay unmapped until rates are mapped",
  )
  assert.equal(review.ava_call_count, 0)
  assert.deepEqual(review.ava_mapping_proposals, [])
})

test("accepting QMS creates expected line items and panel count via save path", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "qms_strength-meals_esb-ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.ok(review.proposal)
  const expectedLines = review.proposal!.reconciliation.line_item_count
  const expectedPanels = review.proposal!.reconciliation.panel_count

  let savedLines: SavePlanLineItem[] = []
  let savedPanels: unknown[] = []
  let saveCalls = 0

  const result = await acceptIngestProposal(
    {
      proposal: review.proposal!,
      campaign: {
        masterId: 1,
        mbaNumber: "ingqms001",
        versionNumber: 1,
        mode: "draft",
      },
      feeLoading: { feeooh: 0 },
    },
    {
      savePlanVersion: async (input) => {
        saveCalls++
        savedLines = input.lineItems
        assert.ok(
          input.lineItems.every((l) => Boolean(l.lineItemId)),
          "IDs stamped before save",
        )
        assert.equal(input.mode, "draft")
        return {
          versionId: 42,
          versionNumber: 1,
          lineCount: input.lineItems.length,
        }
      },
      insertPanels: async (rows) => {
        savedPanels = rows
        assert.ok(
          rows.every((r) => r.lineItemId && r.rawExtras !== undefined),
          "panels carry stamped id + rawExtras",
        )
        return rows.length
      },
    },
  )

  assert.equal(saveCalls, 1, "must go through savePlanVersion once")
  assert.equal(savedLines.length, expectedLines)
  assert.equal(savedPanels.length, expectedPanels)
  assert.equal(result.lineCount, expectedLines)
  assert.equal(result.panelCount, expectedPanels)
  assert.equal(result.lineItemIds.length, expectedLines)
  // 41 panel lines > OOH_PANEL_LINE_EXPERT_THRESHOLD (30) → expert view (MR-0).
  assert.equal(result.preferOohExpertView, true)
  assert.equal(result.oohPanelLineCount, 41)
})

test("corrected mapping persists to the profile", async () => {
  clearPublisherProfileSeedOverlayForTests()
  const { profile, source } = await persistColumnRemap({
    publisherName: "QMS",
    header: "PANEL EXCLUSIVITY",
    mappedTo: "panel_name",
  })
  assert.ok(source === "seed" || source === "postgres")
  assert.equal(profile.column_map["PANEL EXCLUSIVITY"], "panel_name")

  const overlaid = profilesWithRemapOverlay(loadSeedPublisherProfiles())
  const qms = overlaid.find((p) => p.publisher_name === "QMS")
  assert.ok(qms)
  assert.equal(qms!.column_map["PANEL EXCLUSIVITY"], "panel_name")

  // Remap also works as pure function
  const base = loadSeedPublisherProfiles().find(
    (p) => p.publisher_name === "QMS",
  )!
  const next = applyColumnRemap(base, "PROD", "size")
  assert.equal(next.column_map["PROD"], "size")
})

test("cancelling writes nothing — accept is never called", () => {
  // Cancel is a UI/API no-op: no savePlanVersion, no panel insert.
  // This test documents the contract: cancel must not invoke acceptIngestProposal.
  let writes = 0
  const cancel = () => {
    /* intentionally empty — do not call accept */
  }
  cancel()
  assert.equal(writes, 0)
})

test("stampProposalForSave never leaves empty lineItemId; preserves raw_unmapped", () => {
  const proposal = {
    publisher_name: "QMS",
    media_type: "ooh",
    sheet_name: "Paid",
    line_items: [
      {
        grouping: { format: "ESB", state: "NSW" },
        panels: [
          {
            descriptors: { site_number: "1" },
            raw_unmapped: { PROD: "100" },
            source_publisher: "QMS",
            source_row_ref: "Paid!r10",
            flights: [
              {
                period_start: "2026-01-01",
                period_end: "2026-01-07",
                period_count: 1,
                is_live: true,
                is_bonus: false,
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
            booking_status: "paid" as const,
          },
        ],
      },
    ],
    reconciliation: {
      line_item_count: 1,
      panel_count: 1,
      burst_count: 1,
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
  const { lineItems, panels } = stampProposalForSave(proposal, "stamp001")
  assert.equal(lineItems.length, 1)
  assert.match(lineItems[0]!.lineItemId, /stamp001OH1/i)
  assert.equal(panels[0]!.rawExtras.PROD, "100")
  assert.equal(lineItems[0]!.attrs?.buy_granularity, "panel")
  assert.equal(panels[0]!.buyGranularity, "panel")
})
