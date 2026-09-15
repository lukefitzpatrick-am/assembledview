/**
 * IG-10 — Excel / MBA dialog must name dollars that sit outside MBA scope.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  generateMediaPlan,
  type MediaItems,
  type MediaPlanHeader,
} from "@/lib/generateMediaPlan"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  buildEditorLineItemInputs,
  editorBillingStableLineItemId,
} from "@/lib/finance/buildEditorLineItemInputs"
import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import {
  excludedFromMbaScopeNoteFromLines,
  formatExcludedFromMbaScopeNote,
} from "../excludedMbaScopeNote.js"

const BURST = { startDate: "2026-07-01", endDate: "2026-07-31" }

function oohLine(id: string, budget: number): Record<string, unknown> {
  return {
    line_item_id: id,
    buyType: "fixed_cost",
    totalMedia: budget,
    bursts: [{ ...BURST, budget }],
  }
}

function oohConfig(lines: Record<string, unknown>[]): SeedLineFeesMediaConfig {
  return { billingKey: "ooh", lineItems: lines, containerBursts: [] }
}

test("formatExcludedFromMbaScopeNote is silent when nothing is excluded", () => {
  assert.equal(formatExcludedFromMbaScopeNote(0, 0), null)
  assert.equal(
    excludedFromMbaScopeNoteFromLines([
      { media: 55_500, approved: true, flags: { excluded: false } },
    ]),
    null,
  )
})

test("load → all lines approved; exclude one → totals drop and the note appears", async () => {
  const kept = oohLine("keep", 100_000)
  const drop = oohLine("drop", 31_250.01)
  const allIds = [kept, drop].map((line, i) =>
    editorBillingStableLineItemId("ooh", line, i),
  )
  const loaded = buildEditorLineItemInputs([oohConfig([kept, drop])], {
    isPartialMBA: true,
    partialMBASelectedLineItemIds: { ooh: allIds },
  })
  assert.equal(loaded.every((l) => l.approval === "approved"), true)

  const allIn = computeCampaignFinancials(loaded, { feeLoading: { feeooh: 0 } })
  assert.equal(allIn.mbaScopeTotals.grossMedia, 131_250.01)
  assert.equal(excludedFromMbaScopeNoteFromLines(allIn.perLine), null)

  const dropId = editorBillingStableLineItemId("ooh", drop, 1)
  const afterExclude = buildEditorLineItemInputs([oohConfig([kept, drop])], {
    isPartialMBA: true,
    partialMBASelectedLineItemIds: { ooh: allIds.filter((id) => id !== dropId) },
  })
  const scoped = computeCampaignFinancials(afterExclude, {
    feeLoading: { feeooh: 0 },
  })
  assert.equal(scoped.mbaScopeTotals.grossMedia, 100_000)
  const note = excludedFromMbaScopeNoteFromLines(scoped.perLine)
  assert.equal(
    note,
    "Not in this MBA: $31,250.01 across 1 line (see plan for full schedule)",
  )

  const header: MediaPlanHeader = {
    logoBase64: "",
    logoWidth: 0,
    logoHeight: 0,
    client: "Test",
    brand: "Brand",
    campaignName: "Campaign",
    mbaNumber: "test001",
    clientContact: "",
    planVersion: "1",
    poNumber: "",
    campaignBudget: "$0.00",
    campaignStatus: "planned",
    campaignStart: "01/07/2026",
    campaignEnd: "31/07/2026",
  }
  const emptyMedia: MediaItems = {
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
  }
  const workbook = await generateMediaPlan(
    header,
    emptyMedia,
    {
      gross_media: [{ media_type: "OOH", gross_amount: 100_000 }],
      totals: {
        gross_media: 100_000,
        service_fee: 0,
        production: 0,
        adserving: 0,
        totals_ex_gst: 100_000,
        total_inc_gst: 110_000,
        excluded_from_mba_scope_note: note ?? undefined,
      },
    },
  )
  const sheet = workbook.getWorksheet("Media Plan")
  assert.ok(sheet)
  const labels: string[] = []
  sheet.eachRow((row) => {
    const label = String(row.getCell(13).value ?? "")
    if (label) labels.push(label)
  })
  const grossIdx = labels.indexOf("Total Gross Media:")
  assert.ok(grossIdx >= 0)
  assert.equal(labels[grossIdx + 1], note)
})
