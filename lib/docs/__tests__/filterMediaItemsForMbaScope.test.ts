/**
 * PM-4 — partial MBA scope drops excluded lines from the Media Plan workbook.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"
import { filterMediaItemsForMbaScope } from "@/lib/docs/filterMediaItemsForMbaScope"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  buildEditorLineItemInputs,
} from "@/lib/finance/buildEditorLineItemInputs"
import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import { applyMbaScopeLineApprovals } from "@/lib/mediaplan/mbaScopeForSave"
import { excludedFromMbaScopeNoteFromLines } from "@/lib/mediaplan/excludedMbaScopeNote"
import { buildMediaPlanWorkbookMbaData } from "@/lib/mediaplan/buildMediaPlanWorkbookMbaData"
import {
  generateMediaPlan,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"

const BURST = { startDate: "2026-07-01", endDate: "2026-07-31" }

function emptyMedia(overrides: Partial<MediaItems> = {}): MediaItems {
  return {
    search: [],
    socialMedia: [],
    digiAudio: [],
    digiDisplay: [],
    digiVideo: [],
    bvod: [],
    progDisplay: [],
    progVideo: [],
    progBvod: [],
    progOoh: [],
    progAudio: [],
    newspaper: [],
    magazines: [],
    television: [],
    radio: [],
    ooh: [],
    cinema: [],
    integration: [],
    influencers: [],
    production: [],
    ...overrides,
  }
}

function oohFormLine(id: string, network: string, budget: number): Record<string, unknown> {
  return {
    line_item_id: id,
    lineItemId: id,
    buyType: "fixed_cost",
    network,
    market: "Sydney",
    format: "billboard",
    type: "Static",
    totalMedia: budget,
    bursts: [{ ...BURST, budget }],
  }
}

const HEADER: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Test",
  brand: "Brand",
  campaignName: "Campaign",
  mbaNumber: "scope001",
  clientContact: "",
  planVersion: "1",
  poNumber: "",
  campaignBudget: "$0.00",
  campaignStatus: "planned",
  campaignStart: "01/07/2026",
  campaignEnd: "31/07/2026",
}

test("full scope leaves every exploded row in place", () => {
  const keep = oohFormLine("keep", "KEEP-PUB", 100_000)
  const drop = oohFormLine("drop", "DROP-PUB", 31_250)
  const exploded = explodeExcelLineItems("ooh", keep, 0, 0).concat(
    explodeExcelLineItems("ooh", drop, 0, 1),
  )
  const mediaItems = emptyMedia({ ooh: exploded })
  const full = filterMediaItemsForMbaScope(mediaItems, {
    lineItemIds: null,
  })
  assert.equal(full.ooh.length, 2)
  const absent = filterMediaItemsForMbaScope(mediaItems, null)
  assert.equal(absent.ooh.length, 2)
})

test("partial scope omits the excluded line from the OOH section; totals match the slice; note is present", async () => {
  const keep = oohFormLine("keep", "KEEP-PUB", 100_000)
  const drop = oohFormLine("drop", "DROP-PUB", 31_250.01)
  const formLines = [keep, drop]
  const exploded = formLines.flatMap((line, i) =>
    explodeExcelLineItems("ooh", line, 0, i),
  )
  const scopedItems = filterMediaItemsForMbaScope(emptyMedia({ ooh: exploded }), {
    lineItemIds: ["keep"],
  })
  assert.equal(scopedItems.ooh.length, 1)
  assert.equal(scopedItems.ooh[0]?.line_item_id, "keep")
  assert.equal(
    scopedItems.ooh.some((row) => String(row.network) === "DROP-PUB"),
    false,
  )

  const config: SeedLineFeesMediaConfig = {
    billingKey: "ooh",
    lineItems: formLines,
    containerBursts: [],
  }
  const inputs = applyMbaScopeLineApprovals(
    buildEditorLineItemInputs([config]),
    ["keep"],
  )
  const financials = computeCampaignFinancials(inputs, { feeLoading: { feeooh: 0 } })
  assert.equal(financials.mbaScopeTotals.grossMedia, 100_000)
  const note = excludedFromMbaScopeNoteFromLines(financials.perLine)
  assert.equal(
    note,
    "Not in this MBA: $31,250.01 across 1 line (see plan for full schedule)",
  )

  const mbaData = buildMediaPlanWorkbookMbaData({
    mediaTypes: [{ name: "mp_ooh", label: "OOH" }],
    formFlags: { mp_ooh: true },
    campaignFinancialsMediaByKey: { ooh: 100_000 },
    mbaScopeTotals: financials.mbaScopeTotals,
    excludedFromMbaScopeNote: note,
  })
  assert.equal(mbaData.totals.gross_media, 100_000)

  const workbook = await generateMediaPlan(HEADER, scopedItems, mbaData)
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  const cellText: string[] = []
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value
      if (v == null) return
      cellText.push(typeof v === "string" ? v : String(v))
    })
  })
  assert.equal(cellText.some((t) => t.includes("DROP-PUB")), false)
  assert.equal(cellText.some((t) => t.includes("KEEP-PUB")), true)
  assert.equal(
    cellText.some((t) =>
      t.includes("Not in this MBA: $31,250.01 across 1 line (see plan for full schedule)"),
    ),
    true,
  )
})
