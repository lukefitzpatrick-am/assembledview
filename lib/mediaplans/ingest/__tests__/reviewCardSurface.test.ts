/**
 * MR-12 — Section A mirrors the media type's editor card, not every template row.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { getTargetTemplate } from "../targetTemplates"
import { buildReviewCardSurface } from "../reviewCardSurface"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

const OOH_CARD_IDS = [
  "publisher",
  "format",
  "buyType",
  "type",
  "size",
  "market",
  "buying_demo",
  "placement",
  "media_money",
  "burst_dates",
  "line_detail",
] as const

const RADIO_CARD_IDS = [
  "publisher",
  "station",
  "placement",
  "duration",
  "spot_counts",
  "media_money",
  "burst_dates",
] as const

const OOH_NOT_STANDALONE = [
  "site_number",
  "panel_name",
  "latitude",
  "longitude",
  "illumination",
  "rotation_seconds",
  "charges",
  "lunar_rate",
  "buy_granularity",
] as const

test("OOH template card_field_ids match the editor card + money + dates", () => {
  const ooh = getTargetTemplate("ooh")
  assert.deepEqual(ooh.card_field_ids, [
    "publisher",
    "format",
    "buyType",
    "type",
    "size",
    "market",
    "buying_demo",
    "placement",
    "media_money",
    "burst_dates",
  ])
  assert.equal(ooh.detail_table?.id, "line_detail")
  assert.equal(ooh.detail_table?.label, "Line detail")
  assert.ok((ooh.detail_table?.field_ids.length ?? 0) > 0)
  assert.ok(ooh.money_detail_ids?.includes("charges"))
  assert.ok(ooh.money_detail_ids?.includes("lunar_rate"))
})

test("radio template card_field_ids match the radio card; no detail table", () => {
  const radio = getTargetTemplate("radio")
  assert.deepEqual(radio.card_field_ids, [
    "publisher",
    "station",
    "placement",
    "duration",
    "spot_counts",
    "media_money",
    "burst_dates",
  ])
  assert.equal(radio.detail_table, undefined)
})

test("OOH review Section A is the card set + one line-detail row (each line IS its row; supersedes Panel detail)", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "jcd_strength-meals_ooh.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.equal(review.detected_media_type, "ooh")
  assert.equal(review.media_type_status, "detected")
  const surface = buildReviewCardSurface(review.template_coverage!)
  assert.deepEqual(
    surface.rows.map((r) => r.id),
    [...OOH_CARD_IDS],
  )
  for (const id of OOH_NOT_STANDALONE) {
    assert.ok(
      !surface.rows.some((r) => r.id === id),
      `${id} must not be a standalone Section A row`,
    )
  }
  const detail = surface.rows.find((r) => r.id === "line_detail")
  assert.ok(detail)
  assert.equal(detail!.kind, "detail_table")
  if (detail!.kind === "detail_table") {
    assert.match(detail!.summary, /Line detail — \d+ of \d+ matched/)
    assert.ok(detail!.fields.length > 0)
  }
  const money = surface.rows.find((r) => r.id === "media_money")
  assert.equal(money?.kind, "field")
  if (money?.kind === "field") {
    assert.ok(money.details.some((d) => d.id === "charges"))
    assert.ok(money.details.some((d) => d.id === "lunar_rate"))
  }
})

test("radio review Section A is the radio card set with no detail row", async () => {
  const profiles = loadSeedPublisherProfiles()
  const review = await buildIngestReviewFromFile(
    path.join(FIX, "sca_boss-engineering_fy26_v2-rev.xlsx"),
    profiles,
    { skipAva: true },
  )
  assert.equal(review.detected_media_type, "radio")
  assert.equal(review.media_type_status, "detected")
  const surface = buildReviewCardSurface(review.template_coverage!)
  assert.deepEqual(
    surface.rows.map((r) => r.id),
    [...RADIO_CARD_IDS],
  )
  assert.ok(!surface.rows.some((r) => r.kind === "detail_table"))
})

test("a media type with no detail_table renders no detail row", () => {
  const radio = getTargetTemplate("radio")
  const coverage = {
    media_type: "radio",
    required: radio.required.map((f) => ({
      id: f.id,
      label: f.label,
      role: "required" as const,
      matched: true,
      dest: f.dest,
      source: { kind: "header" as const, header: f.id },
      confidence: 1,
      canonicals: f.canonicals,
    })),
    enrich: radio.enrich.map((f) => ({
      id: f.id,
      label: f.label,
      role: "enrich" as const,
      matched: false,
      dest: f.dest,
      source: { kind: "unmatched" as const },
      confidence: 0,
      canonicals: f.canonicals,
    })),
    not_used: [],
    required_matched: radio.required.length,
    required_count: radio.required.length,
    completeness: 1,
    grid: { resolved: 1, total: 1, unresolved_headers: [] },
    warnings: [],
    waivers: radio.system_waivers.map((w) => ({
      fieldId: w.id,
      defaultValue: w.default,
      by: "system",
      reason: w.reason,
    })),
    unresolved_controlled: [],
    resolved_controlled: [],
  }
  const surface = buildReviewCardSurface(coverage)
  assert.ok(!surface.rows.some((r) => r.kind === "detail_table"))
  assert.ok(!surface.rows.some((r) => r.id === "line_detail"))
})
