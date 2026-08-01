/**
 * CP-3 — status scope + media-only payables composition (fixture, no DB).
 *
 * A draft campaign is excluded from totals but visible in coverage.excludedByStatusCents.
 * Orphan non-service media stays in the headline but is not line-detail-attributed.
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  FINANCE_EXCLUDED_CAMPAIGN_STATUSES,
  FINANCE_INCLUDED_CAMPAIGN_STATUSES,
  PAYABLES_MEDIA_ONLY_BASIS_CAPTION,
  formatExcludedByStatusCaption,
  isFinanceExcludedCampaignStatus,
  isFinanceIncludedCampaignStatus,
} from "../financeCampaignStatus.js"
import { isServiceLineItemId } from "../serviceLineBucket.js"

type Cell = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  amountCents: number
  campaignStatus: string
  clientPaysForMedia: boolean | null // null = orphan (no li)
}

function joinResolved(cell: Cell): { orphan: boolean; clientPays: boolean } {
  if (cell.clientPaysForMedia == null) return { orphan: true, clientPays: false }
  return { orphan: false, clientPays: cell.clientPaysForMedia }
}

/** Mirror of summary/costs media-only payables + coverage (CP-3). */
function composePayables(cells: Cell[]) {
  let mediaHeadline = 0
  let feeCents = 0
  let adservingCents = 0
  let lineDetailCents = 0
  let campaignLevelCents = 0
  let orphanLineCents = 0
  let clientPaysExcludedCents = 0
  const excludedByStatusCents = { media: 0, fee: 0, adserving: 0 }

  for (const cell of cells) {
    if (isFinanceExcludedCampaignStatus(cell.campaignStatus)) {
      if (cell.component === "media") excludedByStatusCents.media += cell.amountCents
      else if (cell.component === "fee") excludedByStatusCents.fee += cell.amountCents
      else excludedByStatusCents.adserving += cell.amountCents
      continue
    }
    if (!isFinanceIncludedCampaignStatus(cell.campaignStatus)) continue

    if (cell.component === "fee") {
      feeCents += cell.amountCents
      continue
    }
    if (cell.component === "adserving") {
      adservingCents += cell.amountCents
      continue
    }

    // media
    const { orphan, clientPays } = joinResolved(cell)
    if (clientPays) {
      clientPaysExcludedCents += cell.amountCents
      continue
    }
    mediaHeadline += cell.amountCents
    if (isServiceLineItemId(cell.lineItemId)) {
      campaignLevelCents += cell.amountCents
    } else if (orphan) {
      orphanLineCents += cell.amountCents
    } else {
      lineDetailCents += cell.amountCents
    }
  }

  return {
    mediaHeadline,
    feeCents,
    adservingCents,
    lineDetailCents,
    campaignLevelCents,
    orphanLineCents,
    clientPaysExcludedCents,
    excludedByStatusCents,
  }
}

const FIXTURE: Cell[] = [
  // Live booked agency media
  {
    lineItemId: "live-se1",
    component: "media",
    amountCents: 100_000_00,
    campaignStatus: "booked",
    clientPaysForMedia: false,
  },
  // Live fee — not in headline
  {
    lineItemId: "live-se1",
    component: "fee",
    amountCents: 10_000_00,
    campaignStatus: "booked",
    clientPaysForMedia: false,
  },
  // Live client-pays media — excluded from headline, counted in clientPaysExcluded
  {
    lineItemId: "live-pd1",
    component: "media",
    amountCents: 5_000_00,
    campaignStatus: "approved",
    clientPaysForMedia: true,
  },
  // Orphan non-service on completed tip — in headline, not line-detail
  {
    lineItemId: "orphan-legacy-id",
    component: "media",
    amountCents: 8_000_00,
    campaignStatus: "completed",
    clientPaysForMedia: null,
  },
  // Draft campaign media — must NOT enter totals; visible in coverage
  {
    lineItemId: "draft-se1",
    component: "media",
    amountCents: 50_000_00,
    campaignStatus: "draft",
    clientPaysForMedia: false,
  },
  // Draft fee
  {
    lineItemId: "__service__fees",
    component: "fee",
    amountCents: 2_000_00,
    campaignStatus: "draft",
    clientPaysForMedia: false,
  },
  // Planned media
  {
    lineItemId: "planned-tv1",
    component: "media",
    amountCents: 12_000_00,
    campaignStatus: "planned",
    clientPaysForMedia: false,
  },
  // Cancelled media
  {
    lineItemId: "cancel-ooh1",
    component: "media",
    amountCents: 3_000_00,
    campaignStatus: "cancelled",
    clientPaysForMedia: false,
  },
  // Campaign-level service media on booked
  {
    lineItemId: "__service__media_total",
    component: "media",
    amountCents: 20_000_00,
    campaignStatus: "booked",
    clientPaysForMedia: false,
  },
]

test("status helpers recognise included vs excluded sets", () => {
  for (const s of FINANCE_INCLUDED_CAMPAIGN_STATUSES) {
    assert.equal(isFinanceIncludedCampaignStatus(s), true)
    assert.equal(isFinanceExcludedCampaignStatus(s), false)
  }
  for (const s of FINANCE_EXCLUDED_CAMPAIGN_STATUSES) {
    assert.equal(isFinanceExcludedCampaignStatus(s), true)
    assert.equal(isFinanceIncludedCampaignStatus(s), false)
  }
  assert.equal(isFinanceIncludedCampaignStatus("Approved"), true)
  assert.equal(isFinanceExcludedCampaignStatus("DRAFT"), true)
})

test("draft campaign fixture is excluded from totals but visible in coverage", () => {
  const r = composePayables(FIXTURE)

  // Headline = live agency media + orphan + service media (not fee, not draft/planned/cancelled, not CP)
  assert.equal(r.mediaHeadline, 100_000_00 + 8_000_00 + 20_000_00)
  assert.equal(r.feeCents, 10_000_00)
  assert.equal(r.adservingCents, 0)

  // Draft $50k + planned $12k + cancelled $3k = $65k media excluded
  assert.equal(r.excludedByStatusCents.media, 50_000_00 + 12_000_00 + 3_000_00)
  assert.equal(r.excludedByStatusCents.fee, 2_000_00)

  // Draft $50k must not enter the headline
  assert.ok(r.mediaHeadline < 50_000_00 || r.excludedByStatusCents.media >= 50_000_00)
  assert.equal(
    r.mediaHeadline + r.excludedByStatusCents.media + r.clientPaysExcludedCents,
    100_000_00 + 8_000_00 + 20_000_00 + 65_000_00 + 5_000_00
  )

  assert.equal(r.clientPaysExcludedCents, 5_000_00)
  assert.equal(r.orphanLineCents, 8_000_00)
  assert.equal(r.lineDetailCents, 100_000_00)
  assert.equal(r.campaignLevelCents, 20_000_00)

  assert.equal(
    formatExcludedByStatusCaption(r.excludedByStatusCents.media),
    "Excludes $65,000.00 in draft/planned/cancelled campaigns"
  )
  assert.ok(
    PAYABLES_MEDIA_ONLY_BASIS_CAPTION.includes(
      "media on the delivery schedule · campaign statuses approved/booked/completed"
    )
  )
})
