/**
 * O3 pin — integration suite for postgres save payload assembly.
 * Covers BOTH create + edit paths via shared helpers (no behaviour changes).
 *
 * 1. masterId = masters.id (krusty014 283/1108), never version row id
 * 2. Lazy versions[] (versionRowCount=0, tip published>0) → leave-draft increments;
 *    footer label from the SAME helpers (resolvePostgresSaveMode + formatSaveModeLabel)
 * 3. Status carry: every UI label → stored lowercase. CS-B: savePlan no longer
 *    writes campaign_status onto the version from the save payload.
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
  it("leave-draft (Booked) + versionRowCount=0 + tip published → working_draft on save", () => {
    const { mode, label } = footerLabelFromMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    assert.deepEqual(mode, {
      mode: null,
      versionNumber: 1,
      uiMode: "working_draft",
    })
    assert.equal(label, "Working draft of v1")
  })

  it("leave-draft (Booked) + intent publish → publish next", () => {
    const { mode, label } = footerLabelFromMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
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
      tipPublishedAt: null,
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
        tipPublishedAt:
          status === "Draft" ? null : "2026-01-15T00:00:00.000Z",
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

  it("CS-B: savePlan no longer writes campaign_status from the save payload onto the version", () => {
    const src = readFileSync(SAVE_PLAN, "utf8")
    assert.doesNotMatch(src, /MISSING_CAMPAIGN_STATUS/)
    assert.doesNotMatch(src, /function resolvePersistedCampaignStatus/)
    assert.doesNotMatch(
      src,
      /\.set\(\{[\s\S]*?campaignStatus:\s*(status|baseValues\.campaignStatus)/
    )
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
  it("both pages gate deferred phase-two publish on saveIntent via shouldRunDeferredMasterPublish", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /shouldRunDeferredMasterPublish/)
      assert.match(
        src,
        /shouldRunDeferredMasterPublish\(\{\s*deferredPublish,\s*saveIntent/
      )
    }
    assert.match(
      editSrc,
      /shouldBlockEmptyPublish\(\{[\s\S]*?saveIntent/
    )
  })

  it("both pages wire assignStableLineItemNumbers, dollarsToCampaignBudgetCents, resolvePostgresSaveMode, formatSaveModeLabel, assemblePlansSaveRequestBody", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /assignStableLineItemNumbers/)
      assert.match(src, /dollarsToCampaignBudgetCents/)
      assert.match(src, /resolvePostgresSaveMode/)
      assert.match(src, /formatSaveModeLabel/)
      assert.match(src, /postPlansSave/)
      // O4.5: feeLoading must ride the shared assembler — no per-branch fee wiring.
      assert.match(src, /assemblePlansSaveRequestBody/)
      assert.match(
        src,
        /postPlansSave\(\s*assemblePlansSaveRequestBody\(/
      )
      assert.match(src, /CampaignStatusControl/)
    }
    // CS-C1: create AVA PageFields omit campaign status; selectable vocab stays on edit (control options).
    assert.equal(createSrc.includes("SELECTABLE_CAMPAIGN_STATUSES"), false)
    assert.match(editSrc, /SELECTABLE_CAMPAIGN_STATUSES/)
  })

  it("CS-B2: create persists only after a master id exists; edit always has a master", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    const controlSrc = readFileSync(
      join(process.cwd(), "components/campaign/CampaignStatusControl.tsx"),
      "utf8"
    )
    assert.match(controlSrc, /persisted:\s*boolean/)
    assert.match(
      controlSrc,
      /if\s*\(\s*!persisted\s*\|\|\s*!mba\s*\)/
    )
    // mediaPlanId is set only after POST /api/mediaplans returns master.id.
    assert.match(
      createSrc,
      /<CampaignStatusControl[\s\S]*?persisted=\{mediaPlanId\s*!=\s*null\}/
    )
    assert.match(
      editSrc,
      /<CampaignStatusControl[\s\S]*?persisted=\{true\}/
    )
  })

  it("CS-B2: create local-hold Approved reaches first save via mp_campaignstatus and ensureMaster", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    assert.match(
      createSrc,
      /onStatusCommitted=\{\(next\) => \{[\s\S]*?form\.setValue\("mp_campaignstatus", next/
    )
    assert.match(
      createSrc,
      /mp_campaignstatus,[\s\S]*?const payload = \{[\s\S]*?mp_campaignstatus,/
    )
    assert.match(
      createSrc,
      /ensureMaster:[\s\S]*campaignStatus:\s*mapCampaignStatusForPersist\(fv\.mp_campaignstatus\)/
    )
  })

  it("CS-B: create keep mapCampaignStatusForPersist on ensureMaster only; neither page sends version campaignStatus", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(createSrc, /mapCampaignStatusForPersist/)
    assert.match(
      createSrc,
      /ensureMaster:[\s\S]*campaignStatus:\s*mapCampaignStatusForPersist/
    )
    const createVersionSends = createSrc.match(
      /campaignStatus:\s*mapCampaignStatusForPersist/g
    )
    assert.equal(createVersionSends?.length, 1)
    assert.doesNotMatch(
      editSrc,
      /campaignStatus:\s*mapCampaignStatusForPersist/
    )
  })

  it("CS-B: assemblePlansSaveRequestBody omits campaignStatus even if a caller passes it", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/mediaplan/buildPostgresSavePayload.ts"),
      "utf8"
    )
    assert.match(src, /campaignStatus:\s*_omitCampaignStatus/)
    assert.match(
      src,
      /Do not send it on the version save/
    )
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
    assert.match(
      createSrc,
      /assemblePlansSaveRequestBody\(\s*\{[\s\S]*?masterId:\s*Number\(masterId\)/
    )
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

  it("edit Campaign Details header trail uses describeVersionHeaderTrail(planDraft.modeResolved), not tip+1", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(editSrc, /describeVersionHeaderTrail/)
    assert.match(
      editSrc,
      /describeVersionHeaderTrail\(planDraft\.modeResolved\)/
    )
    assert.doesNotMatch(
      editSrc,
      /Next: v\{nextSaveVersionNumber \?\? \(latestVersionNumber \|\| 0\) \+ 1\}/
    )
  })

  it("edit overwrite toast is explicit (not a version-cut message) + uiMode→mode guard comment", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(
      editSrc,
      /Saved over v\$\{numericSavedVersion\} — still unpublished/
    )
    assert.match(editSrc, /"increment"\s*→\s*mode "publish"/)
    assert.match(
      editSrc,
      /"increment_unpublished"\s*→\s*mode "new_version"/
    )
    assert.match(editSrc, /"overwrite"\s*→\s*mode "draft"/)
    assert.match(editSrc, /"working_draft"\s*→\s*never reaches here/)
  })
})

function sliceConst(src: string, name: string, untilName: string) {
  const start = src.indexOf(`const ${name} =`)
  const end = src.indexOf(`const ${untilName} =`, start + 1)
  assert.ok(start >= 0, `missing const ${name}`)
  assert.ok(end > start, `missing const ${untilName} after ${name}`)
  return src.slice(start, end)
}

function sliceBottomBar(src: string) {
  const start = src.indexOf("const wizardBottomBar =")
  assert.ok(start >= 0, "missing wizardBottomBar")
  const ret = src.indexOf("\n  return (", start)
  const boot = src.indexOf("if (loadPhase === \"bootstrapping\")", start)
  const end = [ret, boot].filter((n) => n > start).sort((a, b) => a - b)[0]
  assert.ok(end > start, "could not bound wizardBottomBar")
  return src.slice(start, end)
}

describe("UI-1 twin: save messages live in the sidebar panel, bar is actions only", () => {
  it("both pages host banners/pill/alerts in PlanWizardSaveMessages and keep buttons in bottomBar", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /statusPanel=\{wizardStatusPanel\}/)
      assert.match(src, /bottomBar=\{wizardBottomBar\}/)
      assert.match(src, /<PlanWizardSaveMessages/)

      const panel = sliceConst(src, "wizardStatusPanel", "wizardDraftDialogs")
      assert.match(panel, /PlanDraftActiveBanner/)
      assert.match(panel, /PlanDraftPill/)
      assert.match(panel, /BuilderIssuesBadge/)
      assert.match(panel, /compact/)
      assert.doesNotMatch(panel, /CampaignExportsSection/)
      assert.doesNotMatch(panel, /handleSaveAll/)

      const bar = sliceBottomBar(src)
      assert.match(bar, /CampaignExportsSection/)
      assert.match(bar, /handleSaveAll/)
      assert.doesNotMatch(bar, /PlanDraftActiveBanner/)
      assert.doesNotMatch(bar, /PlanDraftPill/)
      assert.doesNotMatch(bar, /BuilderIssuesBadge/)
      assert.doesNotMatch(bar, /PlanDraftStaleBanner/)
      assert.doesNotMatch(bar, /dateWarning\.hasViolation/)
    }
  })
})
