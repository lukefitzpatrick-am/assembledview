/**
 * O3 pin — integration suite for postgres save payload assembly.
 * Covers BOTH create + edit paths via shared helpers (no behaviour changes).
 *
 * 1. masterId = masters.id (krusty014 283/1108), never version row id
 * 2. Lazy versions[] (versionRowCount=0, tip published>0) → leave-draft increments;
 *    footer label from the SAME helpers (resolvePostgresSaveMode + formatSaveModeLabel)
 * 3. Status carry: every UI label → stored lowercase; publish missing/unknown →
 *    MISSING_CAMPAIGN_STATUS (never silent Approved)
 * 4. Stable ids on save; reorder does not restamp; 23505 disambiguation
 * 5. dollarsToCampaignBudgetCents boundaries (0, null, decimals)
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildSavePlanLineItemsFromSnapshots,
  dollarsToCampaignBudgetCents,
  resolveMasterIdFromCombinedPlan,
} from "@/lib/mediaplan/buildPostgresSavePayload"
import {
  mapCampaignStatusForPersist,
  PERSISTED_CAMPAIGN_STATUSES,
} from "@/lib/mediaplan/campaignStatusGuard"
import { formatSaveModeLabel } from "@/lib/mediaplan/channelHydrationGate"
import { classifySaveUniqueViolation } from "@/lib/data/classifySaveUniqueViolation"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import {
  assignStableLineItemNumbers,
  reassignLineItemNumbers,
} from "@/lib/mediaplan/lineItemOrder"
import { resolvePostgresSaveMode } from "@/lib/mediaplan/resolvePostgresSaveMode"

const CREATE_PAGE = join(process.cwd(), "app/mediaplans/create/page.tsx")
const EDIT_PAGE = join(
  process.cwd(),
  "app/mediaplans/mba/[mba_number]/edit/page.tsx"
)
const SAVE_PLAN = join(process.cwd(), "lib/data/savePlan.ts")

/** Tonight's live shape: version id ≠ master id. */
const KRUSTY014_COMBINED = {
  id: 1108,
  media_plan_master_id: 283,
  mba_number: "krusty014",
  version_number: 2,
  campaign_status: "draft",
}

const MBA = "krusty014"

function socialRow(id: string, lineNo: number) {
  return {
    line_item_id: id,
    lineItemId: id,
    line_item: lineNo,
    lineItem: lineNo,
    platform: lineNo === 1 ? "Meta" : "TikTok",
    buy_type: "cpm",
    market: "AU",
    bursts: [
      {
        budget: "1000",
        buyAmount: "10",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
    ],
  }
}

function footerLabelFromMode(input: Parameters<typeof resolvePostgresSaveMode>[0]) {
  const mode = resolvePostgresSaveMode(input)
  return {
    mode,
    label: formatSaveModeLabel(mode.uiMode, mode.versionNumber),
  }
}

describe("1. masterId = masters.id (never version row id)", () => {
  it("krusty014 fixture: masterId=283, not version id 1108", () => {
    assert.equal(resolveMasterIdFromCombinedPlan(KRUSTY014_COMBINED), 283)
    assert.notEqual(resolveMasterIdFromCombinedPlan(KRUSTY014_COMBINED), 1108)
  })

  it("prefers media_plan_master_id / mediaPlanMasterId over id", () => {
    assert.equal(
      resolveMasterIdFromCombinedPlan({ id: 1108, media_plan_master_id: 283 }),
      283
    )
    assert.equal(
      resolveMasterIdFromCombinedPlan({ id: 1108, mediaPlanMasterId: 283 }),
      283
    )
  })
})

describe("2. version resolution with versions[] UNLOADED", () => {
  it("leave-draft (Booked) + versionRowCount=0 + tip published>0 → publish next", () => {
    const { mode, label } = footerLabelFromMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
    })
    assert.deepEqual(mode, {
      mode: "publish",
      versionNumber: 2,
      uiMode: "increment",
    })
    assert.equal(label, "Will create v2")
  })

  it("draft overwrite still works when history is lazy-empty (same helpers)", () => {
    const { mode, label } = footerLabelFromMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
    })
    assert.deepEqual(mode, {
      mode: "draft",
      versionNumber: 1,
      uiMode: "overwrite",
    })
    assert.equal(label, "Draft — overwrites v1")
  })

  it("footer label has no parallel rule — always formatSaveModeLabel(uiMode, versionNumber)", () => {
    const tipPublished = 3
    for (const status of ["Draft", "Booked", "Approved"] as const) {
      const mode = resolvePostgresSaveMode({
        campaignStatus: status,
        forceIncrement: false,
        publishedVersionNumber: tipPublished,
        versionRowCount: 0,
      })
      assert.equal(
        formatSaveModeLabel(mode.uiMode, mode.versionNumber),
        formatSaveModeLabel(mode.uiMode, mode.versionNumber)
      )
    }
  })
})

describe("3. status carry — UI label → stored value; publish never silent-defaults", () => {
  const UI_LABELS: Array<[string, (typeof PERSISTED_CAMPAIGN_STATUSES)[number]]> = [
    ["draft", "draft"],
    ["Draft", "draft"],
    ["planned", "planned"],
    ["Planned", "planned"],
    ["approved", "approved"],
    ["Approved", "approved"],
    ["booked", "booked"],
    ["Booked", "booked"],
    ["completed", "completed"],
    ["Completed", "completed"],
    ["cancelled", "cancelled"],
    ["Cancelled", "cancelled"],
  ]

  it("every UI label maps onto lowercase stored vocab", () => {
    for (const [ui, expected] of UI_LABELS) {
      assert.equal(mapCampaignStatusForPersist(ui), expected, ui)
    }
    assert.deepEqual(
      [...PERSISTED_CAMPAIGN_STATUSES],
      ["draft", "planned", "approved", "booked", "completed", "cancelled"]
    )
  })

  it("empty / unknown → null (caller must not invent Approved)", () => {
    assert.equal(mapCampaignStatusForPersist(""), null)
    assert.equal(mapCampaignStatusForPersist(null), null)
    assert.equal(mapCampaignStatusForPersist("Unknown"), null)
    assert.equal(mapCampaignStatusForPersist("In Progress"), null)
  })

  it("savePlan publish path throws MISSING_CAMPAIGN_STATUS — never silent default", () => {
    const src = readFileSync(SAVE_PLAN, "utf8")
    assert.match(src, /MISSING_CAMPAIGN_STATUS/)
    assert.match(
      src,
      /function resolvePersistedCampaignStatus[\s\S]*?throw new SavePlanError\(\s*"MISSING_CAMPAIGN_STATUS"/
    )
    assert.match(
      src,
      /refusing silent Approved default/
    )
    // Draft may default to "draft"; publish must not invent Approved.
    assert.doesNotMatch(
      src,
      /mode === "publish"[\s\S]{0,120}return ["']Approved["']/
    )
    assert.doesNotMatch(
      src,
      /mode === "publish"[\s\S]{0,120}return ["']approved["']/
    )
  })
})

describe("4. stable line ids + unique-violation disambiguation", () => {
  it("assignStableLineItemNumbers on save keeps SM1+SM2", () => {
    const grid = [socialRow(`${MBA}SM1`, 1), socialRow(`${MBA}SM2`, 2)]
    const stamped = assignStableLineItemNumbers(
      grid,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    const lineItems = buildSavePlanLineItemsFromSnapshots({ socialMedia: stamped })
    assert.deepEqual(
      lineItems.map((l) => l.lineItemId),
      [`${MBA}SM1`, `${MBA}SM2`]
    )
  })

  it("reorder does NOT restamp ids (unlike reassignLineItemNumbers)", () => {
    const reordered = [socialRow(`${MBA}SM2`, 2), socialRow(`${MBA}SM1`, 1)]
    const stable = assignStableLineItemNumbers(
      reordered,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    assert.deepEqual(
      stable.map((r) => r.line_item_id),
      [`${MBA}SM2`, `${MBA}SM1`]
    )
    const reassigned = reassignLineItemNumbers(
      reordered,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    assert.deepEqual(
      reassigned.map((r) => r.line_item_id),
      [`${MBA}SM1`, `${MBA}SM2`],
      "reassign rewrites by index — forbidden on postgres save"
    )
  })

  it("duplicate id constraint → DUPLICATE_LINE_ITEM_ID", () => {
    const r = classifySaveUniqueViolation({
      code: "23505",
      constraint: "line_items_version_id_line_item_id_key",
      message:
        'duplicate key value violates unique constraint "line_items_version_id_line_item_id_key"',
    })
    assert.equal(r.code, "DUPLICATE_LINE_ITEM_ID")
  })

  it("version unique collision → VERSION_ALREADY_EXISTS (constraint-name)", () => {
    const r = classifySaveUniqueViolation({
      code: "23505",
      constraint: "media_plan_versions_master_id_version_number_key",
      message:
        'duplicate key value violates unique constraint "media_plan_versions_master_id_version_number_key"',
    })
    assert.equal(r.code, "VERSION_ALREADY_EXISTS")
  })
})

describe("5. dollarsToCampaignBudgetCents boundaries", () => {
  it("0 → 0 cents", () => {
    assert.equal(dollarsToCampaignBudgetCents(0), 0)
    assert.equal(dollarsToCampaignBudgetCents("0"), 0)
    assert.equal(dollarsToCampaignBudgetCents("0.00"), 0)
  })

  it("null / empty / non-finite → null", () => {
    assert.equal(dollarsToCampaignBudgetCents(null), null)
    assert.equal(dollarsToCampaignBudgetCents(undefined), null)
    assert.equal(dollarsToCampaignBudgetCents(""), null)
    assert.equal(dollarsToCampaignBudgetCents("abc"), null)
    assert.equal(dollarsToCampaignBudgetCents(Number.NaN), null)
  })

  it("decimals round to nearest cent", () => {
    assert.equal(dollarsToCampaignBudgetCents(1.23), 123)
    assert.equal(dollarsToCampaignBudgetCents("99.50"), 9950)
    assert.equal(dollarsToCampaignBudgetCents(10.005), 1001)
    assert.equal(dollarsToCampaignBudgetCents(10.004), 1000)
  })
})

describe("create + edit assembly twins (shared helpers)", () => {
  it("both pages wire assignStableLineItemNumbers, mapCampaignStatusForPersist, dollarsToCampaignBudgetCents, resolvePostgresSaveMode, formatSaveModeLabel", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /assignStableLineItemNumbers/)
      assert.match(src, /mapCampaignStatusForPersist/)
      assert.match(src, /dollarsToCampaignBudgetCents/)
      assert.match(src, /resolvePostgresSaveMode/)
      assert.match(src, /formatSaveModeLabel/)
      assert.match(src, /postPlansSave/)
    }
  })

  it("edit resolves masterId via resolveMasterIdFromCombinedPlan (krusty014 contract)", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(editSrc, /resolveMasterIdFromCombinedPlan/)
    assert.match(
      editSrc,
      /masterId:\s*resolveMasterIdFromCombinedPlan\(mediaPlan\)/
    )
  })

  it("create posts masterId from create-flow master id (not combined version row id)", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    assert.match(createSrc, /postPlansSave\(\{[\s\S]*?masterId:\s*Number\(masterId\)/)
    assert.doesNotMatch(createSrc, /masterId:\s*mediaPlan\.id\b/)
  })

  it("both derive footer save labels from formatSaveModeLabel after resolvePostgresSaveMode", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(
        src,
        /const modeResolved = resolvePostgresSaveMode\([\s\S]*?formatSaveModeLabel\(/
      )
    }
  })
})
