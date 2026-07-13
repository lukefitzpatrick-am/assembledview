import assert from "node:assert/strict"
import test from "node:test"
import {
  AVA_TOOL_NAMES,
  summariseAudience,
  summariseBestPractice,
  summariseClientDetails,
  summariseCreativeAsset,
  summariseLineItem,
  summariseMethodology,
  summariseNamingRules,
  summarisePacingSnapshot,
} from "../summaries.js"

test("ava tool catalog: names unique and complete", () => {
  assert.equal(new Set(AVA_TOOL_NAMES).size, AVA_TOOL_NAMES.length)
  assert.ok(AVA_TOOL_NAMES.includes("get_client_details"))
  assert.ok(AVA_TOOL_NAMES.includes("get_campaign_context"))
  assert.ok(AVA_TOOL_NAMES.includes("get_saved_audiences"))
  assert.ok(AVA_TOOL_NAMES.includes("get_best_practice"))
  assert.ok(AVA_TOOL_NAMES.includes("get_naming_rules"))
  assert.ok(AVA_TOOL_NAMES.includes("get_creative_assets"))
  assert.ok(AVA_TOOL_NAMES.includes("get_methodology"))
  assert.ok(AVA_TOOL_NAMES.includes("get_pacing_snapshot"))
  assert.ok(AVA_TOOL_NAMES.includes("apply_form_patch"))
  assert.ok(AVA_TOOL_NAMES.includes("get_media_plan_summary"))
  assert.ok(AVA_TOOL_NAMES.includes("get_platform_specs"))
  assert.ok(AVA_TOOL_NAMES.includes("start_mi_interview"))
  assert.ok(AVA_TOOL_NAMES.includes("generate_mi_workbook"))
  assert.ok(AVA_TOOL_NAMES.includes("load_skill"))
  assert.ok(AVA_TOOL_NAMES.includes("generate_performance_report"))
  assert.equal(AVA_TOOL_NAMES.length, 15)
  assert.deepEqual(
    AVA_TOOL_NAMES.slice(-5),
    [
      "get_platform_specs",
      "start_mi_interview",
      "generate_mi_workbook",
      "load_skill",
      "generate_performance_report",
    ],
  )
})

test("get_client_details shape", () => {
  const summary = summariseClientDetails({
    id: 12,
    mp_client_name: "Acme Co",
    brand_colour: "#112233",
    mbaidentifier: "ACM",
    feesearch: 10,
    idmeta: "123",
    idgoogleads: "",
  })
  assert.equal(summary.name, "Acme Co")
  assert.equal(summary.fees.feesearch, 10)
  assert.equal(summary.platformIdsPopulated.idmeta, true)
  assert.equal(summary.platformIdsPopulated.idgoogleads, false)
})

test("get_campaign_context line item shape", () => {
  const row = summariseLineItem("search", {
    id: 1,
    mba_number: "MBA1",
    media_plan_version: 2,
    publisher: "Google",
    totalMedia: 5000,
    line_item_id: "xSE1",
  })
  assert.equal(row.channel, "search")
  assert.equal(row.publisher, "Google")
  assert.equal(row.budget, 5000)
  assert.equal(row.line_item_id, "xSE1")
})

test("get_saved_audiences shape", () => {
  const row = summariseAudience({
    id: 9,
    clients_id: 3,
    mba_number: "MBA1",
    name: "Grocery buyers",
    definition_json: { segment: "groc" },
    composed_wc: 120000,
    client_visible: true,
    created_by_email: "a@b.com",
  })
  assert.equal(row.id, 9)
  assert.equal(row.size, 120000)
  assert.ok(row.definitionSummary.includes("groc"))
})

test("get_best_practice shape", () => {
  const row = summariseBestPractice({
    id: 1,
    media_container: "Search",
    is_active: true,
    best_practice: {
      version: 1,
      sections: [{ heading: "Setup", items: ["Use exact match sparingly"] }],
    },
  })
  assert.equal(row.media_container, "Search")
  assert.equal(row.sections[0]?.heading, "Setup")
})

test("get_naming_rules shape", () => {
  const result = summariseNamingRules("cm360", "campaign", {
    brand: "Acme",
    campaign: "Launch",
    mba: "MBA1",
    month_start: "jan26",
  })
  assert.ok(!result.error)
  assert.ok(Array.isArray(result.elementOrder))
  assert.ok(result.elementOrder.length > 0)
  assert.equal(typeof result.preview, "string")
  assert.ok((result.preview as string).length > 0)
})

test("get_creative_assets shape", () => {
  const row = summariseCreativeAsset({
    id: 4,
    created_at: 1,
    mba_number: "MBA1",
    media_plan_master_id: 1,
    line_item_id: "xSO1",
    source_table: "social",
    asset_name: "Hero",
    original_filename: "hero.png",
    mime_type: "image/png",
    file_size_bytes: 10,
    width_px: 1080,
    height_px: 1080,
    duration_seconds: 0,
    blob_url: "https://example.com/a",
    blob_pathname: "a",
    status: "active",
    uploaded_by_email: "a@b.com",
    uploaded_by_role: "admin",
  })
  assert.equal(row.mime, "image/png")
  assert.equal(row.line_item_id, "xSO1")
  assert.equal(row.status, "active")
})

test("get_methodology shape", () => {
  const row = summariseMethodology({
    methodology_id: "affinity",
    title: "Affinity index",
    formula_text: "reach_in_cell / reach_base",
    description: "How we calculate affinity",
    data_source: "PLANNING_METHODOLOGY",
    sort_order: 1,
    updated_at: null,
  })
  assert.equal(row.methodology_id, "affinity")
  assert.ok(row.formula.includes("reach_in_cell"))
})

test("get_pacing_snapshot shape", () => {
  const snap = summarisePacingSnapshot({
    asOfDate: "2026-07-10",
    planSummary: "MBA: MBA1",
    clientSlug: "acme-co",
    rows: [
      {
        channel: "search",
        mbaNumber: "MBA1",
        clientName: "Acme Co",
        campaignName: "Launch",
        lineItemId: "xSE1",
        status: "on-track",
        spendToDate: 100,
        budget: 500,
      },
      {
        channel: "social",
        mbaNumber: "MBA2",
        clientName: "Other",
        campaignName: "X",
        lineItemId: "y",
        status: "behind",
        spendToDate: 1,
        budget: 2,
      },
    ],
  })
  assert.equal(snap.rowCount, 1)
  assert.equal(snap.rows[0]?.lineItemId, "xSE1")
  assert.equal(snap.statusCounts["on-track"], 1)
})
