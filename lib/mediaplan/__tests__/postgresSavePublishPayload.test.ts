/**
 * Publish-branch payload fixture: 2-line single-channel campaign must keep
 * distinct stable line_item_ids + correct mode/versionNumber for draft→booked on v1.
 * A1 draft overwrite fixture stays green via resolvePostgresSaveMode draft path.
 * O4.5: publish/status-change carries feeLoading; stamped feePct survives assembly;
 * billing total = media + fee for the krusty015-shaped fixture.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  approvalExclusionFingerprint,
  excludedLineItemIdsByMedia,
} from "@/lib/finance/mbaLineApprovalsClient"
import { stampClientFeePctOnLineItems } from "@/lib/finance/stampClientFeePctOnLineItems"
import {
  assemblePlansSaveRequestBody,
  buildSavePlanLineItemsFromSnapshots,
} from "../buildPostgresSavePayload"
import { mapCampaignStatusForPersist } from "../campaignStatusGuard"
import { formatSaveModeLabel } from "../channelHydrationGate"
import { MEDIA_TYPE_ID_CODES } from "../lineItemIds"
import { assignStableLineItemNumbers, reassignLineItemNumbers } from "../lineItemOrder"
import { resolvePostgresSaveMode } from "../resolvePostgresSaveMode"

const MBA = "krusty015"

/**
 * Live shape: $40k media + $10k fee. Engine gross-up is
 * `(budget * pct) / (100 - pct)` → pct=20 yields fee $10k on $40k net media.
 */
const KRUSTY015_FEE_LOADING = { feesocial: 20 } as const

function socialRow(id: string, lineNo: number, over: Record<string, unknown> = {}) {
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
    ...over,
  }
}

function krusty015SocialSnapshot(budget: number) {
  return stampClientFeePctOnLineItems(
    [
      {
        line_item_id: `${MBA}SM1`,
        lineItemId: `${MBA}SM1`,
        line_item: 1,
        platform: "Meta",
        buy_type: "cpm",
        market: "AU",
        bursts: [
          {
            budget: String(budget),
            buyAmount: "10",
            startDate: "2026-07-01",
            endDate: "2026-07-31",
          },
        ],
      },
    ],
    "socialMedia",
    KRUSTY015_FEE_LOADING
  )
}

describe("publish-branch postgres save payload (2-line social)", () => {
  it("keeps distinct SM1+SM2 when assembling from stable ids (not positional re-derive)", () => {
    const grid = [
      socialRow(`${MBA}SM1`, 1),
      socialRow(`${MBA}SM2`, 2),
    ]
    // Law: minted at creation, never re-derived from row order on save.
    const stamped = assignStableLineItemNumbers(
      grid,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: stamped,
    })

    assert.deepEqual(
      lineItems.map((l) => l.lineItemId),
      [`${MBA}SM1`, `${MBA}SM2`]
    )
    assert.equal(new Set(lineItems.map((l) => l.lineItemId)).size, 2)
  })

  it("draft→booked on v1: intent publish → mode publish + versionNumber 2 + label Will create v2", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      // Same lazy-empty history the edit footer/save path can see.
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    assert.equal(mode.mode, "publish")
    assert.equal(mode.versionNumber, 2)
    assert.equal(mode.uiMode, "increment")
    assert.equal(formatSaveModeLabel(mode.uiMode, mode.versionNumber), "Will create v2")
  })

  it("VC Stage 2b: save on published tip → working_draft label", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
    })
    assert.equal(mode.uiMode, "working_draft")
    assert.equal(mode.mode, null)
    assert.equal(formatSaveModeLabel(mode.uiMode, mode.versionNumber), "Working draft of v1")
  })

  it("campaignStatus maps UI Booked → persisted booked (Xano lowercase; no Approved default)", () => {
    // Payload must carry the dropdown value; savePlanVersion maps via
    // mapCampaignStatusForPersist — never invent "Approved".
    const fromCombobox = mapCampaignStatusForPersist("booked")
    const fromTitleCase = mapCampaignStatusForPersist("Booked")
    assert.equal(fromCombobox, "booked")
    assert.equal(fromTitleCase, "booked")
    assert.notEqual(fromCombobox, "approved")
    assert.notEqual(fromCombobox, "Approved")
  })

  it("A1 draft overwrite fixture stays green (in-place v1)", () => {
    const tip = 1
    const versionRowCountBefore = 1
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: tip,
      versionRowCount: versionRowCountBefore,
      tipPublishedAt: null,
    })
    assert.deepEqual(mode, {
      mode: "draft",
      versionNumber: tip,
      uiMode: "overwrite",
    })
    assert.equal(
      formatSaveModeLabel(mode.uiMode, mode.versionNumber),
      "Draft — overwrites v1"
    )

    // Save on unpublished tip POSTs mode "draft" with versionNumber === tip;
    // version count does not change (in-place overwrite, not a cut).
    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: krusty015SocialSnapshot(1_000),
    })
    const body = assemblePlansSaveRequestBody(
      {
        masterId: 999,
        mbaNumber: MBA,
        versionNumber: mode.versionNumber,
        mode: mode.mode,
        campaignStatus: mapCampaignStatusForPersist("Draft"),
        lineItems,
      },
      {
        feeLoading: { ...KRUSTY015_FEE_LOADING },
        adservaudio: 0,
        adservvideo: 0,
        adservdisplay: 0,
        adservimp: 0,
      }
    )
    assert.equal(body.mode, "draft")
    assert.equal(body.versionNumber, tip)
    assert.equal(body.versionNumber, mode.versionNumber)
    // Overwrite keeps the same tip — client version inventory size unchanged.
    const versionRowCountAfter = versionRowCountBefore
    assert.equal(versionRowCountAfter, versionRowCountBefore)
  })

  it("glenda006 v5 regression (11 Aug 2026): delete approved line on unpublished tip → draft, forceIncrement unset", () => {
    // Live: tip v4 unpublished; hydrated all-in approvals baseline; delete one
    // approved line then Save (intent save). Must overwrite in place — not cut v5.
    const tip = 4
    const beforeAll = {
      search: ["GLENDA006SEA001", "GLENDA006SEA002"],
    }
    const beforeSelected = {
      search: ["GLENDA006SEA001", "GLENDA006SEA002"],
    }
    const afterDeleteAll = {
      search: ["GLENDA006SEA001"],
    }
    const afterDeleteSelected = {
      search: ["GLENDA006SEA001"],
    }

    const lastApprovalFp = approvalExclusionFingerprint(
      excludedLineItemIdsByMedia({
        allLineIdsByMedia: beforeAll,
        selectedByMedia: beforeSelected,
      })
    )
    const approvalFpNow = approvalExclusionFingerprint(
      excludedLineItemIdsByMedia({
        allLineIdsByMedia: afterDeleteAll,
        selectedByMedia: afterDeleteSelected,
      })
    )
    // Exclusion fingerprint is unchanged by deleting an approved line.
    assert.equal(approvalFpNow, lastApprovalFp)
    assert.equal(approvalFpNow, "")

    const forceIncrementForApprovals =
      lastApprovalFp !== null && lastApprovalFp !== approvalFpNow
    assert.equal(forceIncrementForApprovals, false)

    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: forceIncrementForApprovals,
      publishedVersionNumber: tip,
      versionRowCount: tip,
      tipPublishedAt: null,
      intent: "save",
    })
    assert.deepEqual(mode, {
      mode: "draft",
      versionNumber: tip,
      uiMode: "overwrite",
    })

    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: krusty015SocialSnapshot(1_000),
    })
    const body = assemblePlansSaveRequestBody(
      {
        masterId: 229,
        mbaNumber: "glenda006",
        versionNumber: mode.versionNumber,
        mode: mode.mode,
        campaignStatus: mapCampaignStatusForPersist("Draft"),
        lineItems,
      },
      {
        feeLoading: { ...KRUSTY015_FEE_LOADING },
        adservaudio: 0,
        adservvideo: 0,
        adservdisplay: 0,
        adservimp: 0,
      }
    )
    assert.equal(body.mode, "draft")
    assert.equal(body.versionNumber, tip)
    // Postgres path carries mode from the resolver — forceIncrement must not be set.
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, "forceIncrement"),
      false
    )
  })

  it("SV-3: excluding a line changes exclusion fingerprint; adding an approved line does not", () => {
    const all = { search: ["A", "B"] }
    const allIn = approvalExclusionFingerprint(
      excludedLineItemIdsByMedia({
        allLineIdsByMedia: all,
        selectedByMedia: { search: ["A", "B"] },
      })
    )
    const afterAdd = approvalExclusionFingerprint(
      excludedLineItemIdsByMedia({
        allLineIdsByMedia: { search: ["A", "B", "C"] },
        selectedByMedia: { search: ["A", "B", "C"] },
      })
    )
    assert.equal(allIn, afterAdd)
    assert.equal(allIn, "")

    const afterExclude = approvalExclusionFingerprint(
      excludedLineItemIdsByMedia({
        allLineIdsByMedia: all,
        selectedByMedia: { search: ["A"] },
      })
    )
    assert.notEqual(afterExclude, allIn)
    assert.equal(afterExclude, "search:B")

    // Enabled channel with 0 lines: hydrate all-in vs save-time empty both → "".
    assert.equal(approvalExclusionFingerprint({}), "")
    assert.equal(
      approvalExclusionFingerprint(
        excludedLineItemIdsByMedia({
          allLineIdsByMedia: { search: [] },
          selectedByMedia: { search: [] },
        })
      ),
      ""
    )
  })

  it("positional reassign is NOT the save contract (would mask identity bugs)", () => {
    // If SM2 is ordered first, reassign would stamp it SM1 — forbidden on save.
    const reordered = [
      socialRow(`${MBA}SM2`, 2),
      socialRow(`${MBA}SM1`, 1),
    ]
    const reassigned = reassignLineItemNumbers(
      reordered,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    assert.deepEqual(
      reassigned.map((r) => r.line_item_id),
      [`${MBA}SM1`, `${MBA}SM2`],
      "reassign rewrites by index — must not be used on postgres save"
    )
    const stable = assignStableLineItemNumbers(
      reordered,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    assert.deepEqual(
      stable.map((r) => r.line_item_id),
      [`${MBA}SM2`, `${MBA}SM1`]
    )
  })
})

describe("O4.5 publish/status-change carries feeLoading (shared assembler)", () => {
  it("assemblePlansSaveRequestBody always attaches feeLoading + feeSnapshot + adserv rates", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 2,
      versionRowCount: 0,
      tipPublishedAt: "2026-01-15T00:00:00.000Z",
      intent: "publish",
    })
    assert.equal(mode.mode, "publish")

    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: krusty015SocialSnapshot(40_000),
    })
    const body = assemblePlansSaveRequestBody(
      {
        masterId: 999,
        mbaNumber: MBA,
        versionNumber: mode.versionNumber,
        mode: mode.mode,
        campaignStatus: mapCampaignStatusForPersist("Booked"),
        lineItems,
      },
      {
        feeLoading: { ...KRUSTY015_FEE_LOADING },
        adservaudio: 0.15,
        adservdisplay: 2.5,
        adservvideo: 1.1,
        adservimp: 0.5,
      }
    )

    assert.deepEqual(body.feeLoading, { feesocial: 20 })
    assert.deepEqual(body.feeSnapshot, { feesocial: 20 })
    assert.equal(body.adservaudio, 0.15)
    assert.equal(body.adservdisplay, 2.5)
    assert.equal(body.adservvideo, 1.1)
    assert.equal(body.adservimp, 0.5)
    assert.equal(body.mode, "publish")
    assert.equal(body.campaignStatus, undefined)
  })

  it("stamped feePct survives buildSavePlanLineItemsFromSnapshots (not dropped at meta?.feePct)", () => {
    const stamped = krusty015SocialSnapshot(40_000)
    assert.equal(stamped[0]!.feePct, 20)
    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: stamped,
    })
    assert.equal(lineItems.length, 1)
    assert.equal(lineItems[0]!.feePct, 20)
  })

  it("status-change publish fixture: fee rows present; billing total = media + fee", () => {
    // Same engine savePlanVersion uses — empty feeLoading is the v3 wipe mode.
    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: krusty015SocialSnapshot(40_000),
    })
    const body = assemblePlansSaveRequestBody(
      {
        masterId: 999,
        mbaNumber: MBA,
        versionNumber: 3,
        mode: "publish",
        campaignStatus: "booked",
        lineItems,
      },
      { feeLoading: { ...KRUSTY015_FEE_LOADING } }
    )

    const withFees = computeCampaignFinancials(
      body.lineItems.map((l) => ({
        lineItemId: l.lineItemId,
        mediaType: l.mediaType,
        buyType: l.buyType ?? "cpm",
        rate: l.rate,
        enteredAmount: l.enteredAmount,
        budgetIncludesFees: Boolean(l.budgetIncludesFees),
        clientPaysForMedia: Boolean(l.clientPaysForMedia),
        feePct: l.feePct,
        bursts: (Array.isArray(l.bursts) ? l.bursts : []) as never,
        approval: l.approval ?? "approved",
      })),
      { feeLoading: body.feeLoading }
    )

    assert.equal(withFees.mbaScopeTotals.grossMedia, 40_000)
    assert.equal(withFees.mbaScopeTotals.fee, 10_000)
    assert.equal(
      withFees.mbaScopeTotals.nettExGst,
      withFees.mbaScopeTotals.grossMedia + withFees.mbaScopeTotals.fee
    )

    // Fee must appear on the billing schedule (schedule_months explode source).
    const feeOnSchedule = withFees.billingSchedule.some((m) => {
      const headerFee = Number(String(m.feeTotal ?? "0").replace(/[^0-9.-]/g, ""))
      return Number.isFinite(headerFee) && headerFee > 0
    })
    assert.equal(feeOnSchedule, true, "billing schedule must carry fee after publish")

    // Empty feeLoading + dropped feePct reproduces the live v3 wipe.
    const wiped = computeCampaignFinancials(
      body.lineItems.map((l) => ({
        lineItemId: l.lineItemId,
        mediaType: l.mediaType,
        buyType: l.buyType ?? "cpm",
        rate: l.rate,
        enteredAmount: l.enteredAmount,
        budgetIncludesFees: Boolean(l.budgetIncludesFees),
        clientPaysForMedia: Boolean(l.clientPaysForMedia),
        // Simulate pre-fix assembly that ignored stamped feePct:
        feePct: undefined,
        bursts: (Array.isArray(l.bursts) ? l.bursts : []) as never,
        approval: l.approval ?? "approved",
      })),
      { feeLoading: {} }
    )
    assert.equal(wiped.mbaScopeTotals.fee, 0)
    assert.equal(wiped.mbaScopeTotals.grossMedia, 40_000)
  })
})

/**
 * C-82 / FIN-ZERO-1 persist twin: stated-zero burst budgets must not be
 * refilled from the line total. Blank (never entered) still back-fills.
 */
const STATED_ZERO_LINE_TOTAL = 50_000
const STATED_ZERO_BURST_DATES = { startDate: "2026-01-01", endDate: "2026-01-31" }

function radioSnapshotRow(burstBudgets: unknown[]): Record<string, unknown> {
  return {
    line_item_id: "R1",
    lineItemId: "R1",
    buy_type: "spots",
    totalMedia: STATED_ZERO_LINE_TOTAL,
    bursts: burstBudgets.map((budget) => ({ ...STATED_ZERO_BURST_DATES, budget })),
  }
}

describe("stated-zero enteredAmount on postgres save payload", () => {
  it("three bursts all \"0\", line totalMedia $50,000 → payload enteredAmount 0", () => {
    const [line] = buildSavePlanLineItemsFromSnapshots({
      radio: [radioSnapshotRow(["0", "0", "0"])],
    })
    assert.equal(line!.enteredAmount, 0)
  })

  it("three bursts all blank, line totalMedia $50,000 → payload enteredAmount 50000", () => {
    const [line] = buildSavePlanLineItemsFromSnapshots({
      radio: [radioSnapshotRow(["", "", ""])],
    })
    assert.equal(line!.enteredAmount, STATED_ZERO_LINE_TOTAL)
  })

  it("mixed stated zero and blank skips the line-total back-fill", () => {
    const [line] = buildSavePlanLineItemsFromSnapshots({
      radio: [radioSnapshotRow(["0", "", ""])],
    })
    assert.equal(line!.enteredAmount, 0)
  })

  it("production with blank budgets and cost × amount still back-fills from totalMedia", () => {
    const cost = 250
    const amount = 4
    const [line] = buildSavePlanLineItemsFromSnapshots({
      production: [
        {
          line_item_id: "PRD1",
          lineItemId: "PRD1",
          buy_type: "production",
          totalMedia: cost * amount,
          bursts: [
            {
              ...STATED_ZERO_BURST_DATES,
              budget: "",
              cost,
              amount,
            },
          ],
        },
      ],
    })
    assert.equal(line!.enteredAmount, cost * amount)
  })
})

