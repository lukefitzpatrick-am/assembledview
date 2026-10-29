import assert from "node:assert/strict"
import test from "node:test"
import {
  AVA_TOOL_NAMES,
  summariseAudience,
  summariseBestPractice,
  summariseClientDetails,
  summariseCreativeAsset,
  summariseDeliverySnapshot,
  summariseLineItem,
  summariseMethodology,
  summariseNamingRules,
  summarisePacingSnapshot,
} from "../summaries.js"

test("ava tool catalog: names unique and complete", () => {
  assert.equal(new Set(AVA_TOOL_NAMES).size, AVA_TOOL_NAMES.length)
  // Named enumeration (not a bare count) — next silent addition fails here.
  assert.deepEqual([...AVA_TOOL_NAMES], [
    "get_media_plan_summary",
    "apply_form_patch",
    "apply_parsed_plan",
    "get_pending_ingest_review",
    "accept_ingest_proposal",
    "load_ingest_into_form",
    "adjust_line_items",
    "calculate_media_math",
    "get_client_details",
    "get_campaign_context",
    "get_saved_audiences",
    "get_best_practice",
    "get_naming_rules",
    "get_creative_assets",
    "get_brand_assets",
    "get_methodology",
    "get_pacing_snapshot",
    "get_delivery_snapshot",
    "get_platform_specs",
    "start_mi_interview",
    "generate_mi_workbook",
    "generate_naming_workbook",
    "load_skill",
    "generate_performance_report",
    "get_client_brain",
    "save_client_brain",
    "get_client_insights",
    "get_campaign_insights",
    "query_campaign_lines",
    "query_schedule_months",
    "search_line_items",
    "query_finance_summary",
    "query_xero_status",
    "run_scenario",
    "preview_billing_revision",
    "apply_billing_revision",
    "query_true_up",
  ])
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
  // No platform accounts passed: meta_page falls back to legacy idmeta; nothing else is linked.
  assert.equal(summary.platformIdsPopulated.meta_page, true)
  assert.equal(summary.platformIdsPopulated.google_ads, false)
  assert.equal(summary.platformAccountsLoaded, false)
  assert.equal("idmeta" in summary.platformIdsPopulated, false)
})

test("get_client_details reads platform accounts, not the legacy id columns", () => {
  const summary = summariseClientDetails(
    { id: 56, mp_client_name: "Treasury Wine Collective", idgoogleads: "TBC", idmeta: "" },
    [
      { platform: "google_ads", accountRef: "4128893012", active: true },
      { platform: "meta_page", accountRef: "  ", active: true },
      { platform: "tiktok", accountRef: "123", active: false },
    ],
  )
  assert.equal(summary.platformAccountsLoaded, true)
  assert.equal(summary.platformIdsPopulated.google_ads, true)
  assert.equal(summary.platformIdsPopulated.meta_ads, false)
  assert.equal(summary.platformIdsPopulated.meta_page, false)
  assert.equal(summary.platformIdsPopulated.tiktok, false)
  const withPage = summariseClientDetails({ id: 1, mp_client_name: "Acme" }, [
    { platform: "meta_page", accountRef: "1122334455", active: true },
  ])
  assert.equal(withPage.platformIdsPopulated.meta_page, true)
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
    uploaded_by_name: "Ada Admin",
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

test("get_delivery_snapshot shape", () => {
  const snap = summariseDeliverySnapshot({
    asOf: "2026-07-13",
    window: { startDate: "2026-01-01", endDate: "2026-06-30" },
    mbaNumber: "MBA1",
    versionNumber: 14,
    channels: [
      {
        group: "social_meta",
        lines: [
          {
            lineItemId: "xSO1",
            name: "Meta prospecting",
            plannedBudget: 10000,
            plannedUnits: null,
            startDate: "2026-01-01",
            endDate: "2026-06-30",
            spendToDate: 36500,
            impressions: 7260000,
            clicks: 12000,
            results: 100,
            video3sViews: 5000,
            cpm: 5.03,
            ctr: 0.00165,
            cpc: 3.04,
            noDeliveryRows: false,
            deliveryState: "reported",
          },
        ],
        totals: {
          spendToDate: 36500,
          impressions: 7260000,
          clicks: 12000,
          results: 100,
          video3sViews: 5000,
          plannedBudget: 10000,
          cpm: 5.03,
          ctr: 0.00165,
          cpc: 3.04,
        },
      },
    ],
    planTotals: {
      spendToDate: 36500,
      impressions: 7260000,
      clicks: 12000,
      results: 100,
      video3sViews: 5000,
      plannedBudget: 10000,
      cpm: 5.03,
      ctr: 0.00165,
      cpc: 3.04,
    },
  })
  assert.equal(snap.mbaNumber, "MBA1")
  assert.equal(snap.versionNumber, 14)
  assert.equal(snap.channels[0]?.group, "social_meta")
  assert.equal(snap.channels[0]?.lines[0]?.impressions, 7260000)
  assert.equal(snap.channels[0]?.lines[0]?.deliveryState, "reported")
  assert.equal(snap.planTotals.spendToDate, 36500)
  assert.equal(snap.liveLineBudgetTotal, 10000)
  assert.equal(snap.reportedTotals.spendToDate, 36500)
})

test("AVA delivery summary strips buyType", () => {
  const snap = summariseDeliverySnapshot({
    asOf: "2026-07-13",
    window: { startDate: "2026-01-01", endDate: "2026-06-30" },
    mbaNumber: "MBA1",
    versionNumber: 14,
    channels: [
      {
        group: "social_meta",
        lines: [
          {
            lineItemId: "xSO1",
            name: "Meta prospecting",
            plannedBudget: 10000,
            plannedUnits: null,
            plannedImpressions: 1000,
            plannedClicks: 50,
            plannedViews: 10,
            buyType: "cpv",
            label: "Meta • Engaged & Prospecting Audiences",
            startDate: "2026-01-01",
            endDate: "2026-06-30",
            spendToDate: 36500,
            impressions: 7260000,
            clicks: 12000,
            results: 100,
            video3sViews: 5000,
            cpm: 5.03,
            ctr: 0.00165,
            cpc: 3.04,
            noDeliveryRows: false,
            deliveryState: "reported",
          },
        ],
        totals: {
          spendToDate: 36500,
          impressions: 7260000,
          clicks: 12000,
          results: 100,
          video3sViews: 5000,
          plannedBudget: 10000,
          cpm: 5.03,
          ctr: 0.00165,
          cpc: 3.04,
        },
      },
    ],
    planTotals: {
      spendToDate: 36500,
      impressions: 7260000,
      clicks: 12000,
      results: 100,
      video3sViews: 5000,
      plannedBudget: 10000,
      cpm: 5.03,
      ctr: 0.00165,
      cpc: 3.04,
    },
  })
  const summaryLine = snap.channels[0]?.lines[0] as Record<string, unknown>
  assert.equal("buyType" in summaryLine, false)
  assert.equal("label" in summaryLine, false)
  assert.equal("plannedImpressions" in summaryLine, false)
  assert.equal("plannedClicks" in summaryLine, false)
  assert.equal("plannedViews" in summaryLine, false)
})

test("get_delivery_snapshot blanks spend on unreported lines", () => {
  const snap = summariseDeliverySnapshot({
    asOf: "2026-09-18",
    window: { startDate: "2026-08-01", endDate: "2026-10-25" },
    mbaNumber: "BICAU002",
    versionNumber: 28,
    channels: [
      {
        group: "digital_video",
        lines: [
          {
            lineItemId: "bicau002dv1",
            name: "UMG Popsta",
            plannedBudget: 18240,
            plannedUnits: null,
            startDate: "2026-08-01",
            endDate: "2026-10-25",
            spendToDate: 9656,
            impressions: 0,
            clicks: 0,
            results: 0,
            video3sViews: 0,
            cpm: null,
            ctr: null,
            cpc: null,
            noDeliveryRows: true,
            deliveryState: "no_source",
          },
        ],
        totals: {
          spendToDate: 9656,
          impressions: 0,
          clicks: 0,
          results: 0,
          video3sViews: 0,
          plannedBudget: 18240,
          cpm: null,
          ctr: null,
          cpc: null,
        },
      },
      {
        group: "social_meta",
        lines: [
          {
            lineItemId: "bicau002sm1",
            name: "Meta",
            plannedBudget: 24662,
            plannedUnits: null,
            startDate: "2026-08-01",
            endDate: "2026-10-25",
            spendToDate: 12460,
            impressions: 3800000,
            clicks: 3400,
            results: 0,
            video3sViews: 1800000,
            cpm: 3.28,
            ctr: 0.00089,
            cpc: 3.66,
            noDeliveryRows: false,
            deliveryState: "reported",
          },
        ],
        totals: {
          spendToDate: 12460,
          impressions: 3800000,
          clicks: 3400,
          results: 0,
          video3sViews: 1800000,
          plannedBudget: 24662,
          cpm: 3.28,
          ctr: 0.00089,
          cpc: 3.66,
        },
      },
    ],
    planTotals: {
      spendToDate: 22116,
      impressions: 3800000,
      clicks: 3400,
      results: 0,
      video3sViews: 1800000,
      plannedBudget: 42902,
      cpm: 5.82,
      ctr: 0.00089,
      cpc: 6.5,
    },
  })
  const umg = snap.channels[0]?.lines[0]
  assert.equal(umg?.deliveryState, "no_source")
  assert.equal(umg?.spendToDate, null)
  assert.equal(umg?.impressions, null)
  assert.equal(umg?.deliveryNote, "has no delivery reporting connected yet")
  assert.equal(snap.reportedTotals.spendToDate, 12460)
  assert.equal(snap.planTotals.spendToDate, 12460)
  assert.equal(snap.liveLineBudgetTotal, 42902)
})

test("get_delivery_snapshot keeps spend_only spend and nulls delivery metrics", () => {
  const snap = summariseDeliverySnapshot({
    asOf: "2026-09-18",
    window: { startDate: "2026-08-01", endDate: "2026-10-25" },
    mbaNumber: "BICAU002",
    versionNumber: 28,
    channels: [
      {
        group: "digital_video",
        lines: [
          {
            lineItemId: "bicau002dv1",
            name: "UMG Popsta",
            plannedBudget: 18240,
            plannedUnits: null,
            startDate: "2026-08-01",
            endDate: "2026-10-25",
            spendToDate: 9656,
            impressions: 0,
            clicks: 0,
            results: 0,
            video3sViews: 0,
            cpm: null,
            ctr: null,
            cpc: null,
            noDeliveryRows: true,
            deliveryState: "spend_only",
          },
        ],
        totals: {
          spendToDate: 9656,
          impressions: 0,
          clicks: 0,
          results: 0,
          video3sViews: 0,
          plannedBudget: 18240,
          cpm: null,
          ctr: null,
          cpc: null,
        },
      },
    ],
    planTotals: {
      spendToDate: 9656,
      impressions: 0,
      clicks: 0,
      results: 0,
      video3sViews: 0,
      plannedBudget: 18240,
      cpm: null,
      ctr: null,
      cpc: null,
    },
  })
  const umg = snap.channels[0]?.lines[0]
  assert.equal(umg?.deliveryState, "spend_only")
  assert.equal(umg?.spendToDate, 9656)
  assert.equal(umg?.impressions, null)
  assert.equal(umg?.clicks, null)
  assert.equal(umg?.deliveryNote, "spend is fixed-cost accrual; no delivery reporting connected")
  assert.equal(snap.reportedTotals.spendToDate, 9656)
  assert.equal(snap.planTotals.spendToDate, 9656)
})

test("get_delivery_snapshot keeps CPM when assumed spend is added", () => {
  const reported = {
    lineItemId: "golf025sm1",
    name: "Meta",
    plannedBudget: 10_000,
    plannedUnits: null,
    startDate: "2026-08-01",
    endDate: "2026-10-25",
    spendToDate: 1_000,
    impressions: 100_000,
    clicks: 50,
    results: 0,
    video3sViews: 0,
    cpm: 10,
    ctr: 0.0005,
    cpc: 20,
    noDeliveryRows: false,
    deliveryState: "reported" as const,
    spendMode: "estimated" as const,
  }
  const without = summariseDeliverySnapshot({
    asOf: "2026-10-12",
    window: { startDate: "2026-08-01", endDate: "2026-10-12" },
    mbaNumber: "GOLF025",
    versionNumber: 37,
    channels: [
      {
        group: "social_meta",
        lines: [reported],
        totals: {
          spendToDate: 1_000,
          impressions: 100_000,
          clicks: 50,
          results: 0,
          video3sViews: 0,
          plannedBudget: 10_000,
          cpm: 10,
          ctr: 0.0005,
          cpc: 20,
        },
      },
    ],
    planTotals: {
      spendToDate: 1_000,
      impressions: 100_000,
      clicks: 50,
      results: 0,
      video3sViews: 0,
      plannedBudget: 10_000,
      cpm: 10,
      ctr: 0.0005,
      cpc: 20,
    },
  })
  const withAssumed = summariseDeliverySnapshot({
    asOf: "2026-10-12",
    window: { startDate: "2026-08-01", endDate: "2026-10-12" },
    mbaNumber: "GOLF025",
    versionNumber: 37,
    channels: [
      {
        group: "social_meta",
        lines: [reported],
        totals: {
          spendToDate: 1_000,
          impressions: 100_000,
          clicks: 50,
          results: 0,
          video3sViews: 0,
          plannedBudget: 10_000,
          cpm: 10,
          ctr: 0.0005,
          cpc: 20,
        },
      },
      {
        group: "assumed_spend",
        lines: [
          {
            lineItemId: "golf025ra1",
            name: "Radio",
            plannedBudget: 1_000,
            plannedUnits: null,
            startDate: "2026-10-01",
            endDate: "2026-10-01",
            spendToDate: 200,
            impressions: 0,
            clicks: 0,
            results: 0,
            video3sViews: 0,
            cpm: null,
            ctr: null,
            cpc: null,
            noDeliveryRows: true,
            deliveryState: "assumed",
            spendMode: "assumed",
          },
        ],
        totals: {
          spendToDate: 200,
          impressions: 0,
          clicks: 0,
          results: 0,
          video3sViews: 0,
          plannedBudget: 1_000,
          cpm: null,
          ctr: null,
          cpc: null,
        },
      },
    ],
    planTotals: {
      spendToDate: 1_000,
      impressions: 100_000,
      clicks: 50,
      results: 0,
      video3sViews: 0,
      plannedBudget: 11_000,
      cpm: 10,
      ctr: 0.0005,
      cpc: 20,
    },
  })
  assert.equal(withAssumed.reportedTotals.cpm, without.reportedTotals.cpm)
  assert.equal(withAssumed.reportedTotals.cpc, without.reportedTotals.cpc)
  assert.equal(withAssumed.reportedTotals.ctr, without.reportedTotals.ctr)
  assert.equal(withAssumed.reportedTotals.assumedSpend, 200)
  assert.equal(withAssumed.reportedTotals.spendToDate, 1_200)
  assert.equal(withAssumed.planTotals.assumedSpend, 200)
  const radio = withAssumed.channels.find((channel) => channel.group === "assumed_spend")?.lines[0]
  assert.equal(radio?.spendToDate, 200)
  assert.equal(radio?.impressions, null)
  assert.match(
    String(radio?.deliveryNote),
    /booked media assumed delivered to plan, not reported/,
  )
  assert.match(withAssumed.reportedTotalsNote, /booked media assumed delivered to plan, not reported/)
})
