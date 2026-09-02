/**
 * CP-3 — status scope + media-only payables composition (fixture, no DB).
 *
 * A draft campaign is excluded from totals but visible in coverage.excludedByStatusCents.
 * Orphan non-service media stays in the headline but is not line-detail-attributed.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { filterPlanVersionsByIncludeDrafts } from "@/lib/finance/filterBillingRecords"
import {
  FINANCE_EXCLUDED_CAMPAIGN_STATUSES,
  FINANCE_INCLUDED_CAMPAIGN_STATUSES,
  FINANCE_STATUS_EXCLUDED_SQL,
  FINANCE_STATUS_INCLUDED_SQL,
  PAYABLES_MEDIA_ONLY_BASIS_CAPTION,
  formatExcludedByStatusCaption,
  isFinanceExcludedCampaignStatus,
  isFinanceIncludedCampaignStatus,
  resolveFinanceCampaignStatus,
} from "../financeCampaignStatus.js"
import { isServiceLineItemId } from "../serviceLineBucket.js"

type Cell = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  amountCents: number
  /** Version-row status (historical snapshot). */
  campaignStatus: string
  /** Master status when threaded; finance must follow this when present. */
  masterCampaignStatus?: string
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
    const status = resolveFinanceCampaignStatus({
      campaign_status: cell.campaignStatus,
      master_campaign_status: cell.masterCampaignStatus,
    })
    if (isFinanceExcludedCampaignStatus(status)) {
      if (cell.component === "media") excludedByStatusCents.media += cell.amountCents
      else if (cell.component === "fee") excludedByStatusCents.fee += cell.amountCents
      else excludedByStatusCents.adserving += cell.amountCents
      continue
    }
    if (!isFinanceIncludedCampaignStatus(status)) continue

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

test("SQL constants read media_plan_masters.campaign_status via alias m", () => {
  assert.match(FINANCE_STATUS_INCLUDED_SQL, /\bm\.campaign_status\b/)
  assert.doesNotMatch(FINANCE_STATUS_INCLUDED_SQL, /\bv\.campaign_status\b/)
  assert.match(FINANCE_STATUS_EXCLUDED_SQL, /\bm\.campaign_status\b/)
  assert.doesNotMatch(FINANCE_STATUS_EXCLUDED_SQL, /\bv\.campaign_status\b/)
})

test("master booked + version planned is included in finance", () => {
  const row = {
    campaign_status: "planned",
    master_campaign_status: "booked",
  }
  const status = resolveFinanceCampaignStatus(row)
  assert.equal(isFinanceIncludedCampaignStatus(status), true)
  assert.equal(isFinanceExcludedCampaignStatus(status), false)

  const kept = filterPlanVersionsByIncludeDrafts([row], false)
  assert.equal(kept.length, 1)

  const r = composePayables([
    {
      lineItemId: "trap-se1",
      component: "media",
      amountCents: 40_000_00,
      campaignStatus: "planned",
      masterCampaignStatus: "booked",
      clientPaysForMedia: false,
    },
  ])
  assert.equal(r.mediaHeadline, 40_000_00)
  assert.equal(r.excludedByStatusCents.media, 0)
})

test("master planned + version booked is excluded from finance", () => {
  const row = {
    campaign_status: "booked",
    master_campaign_status: "planned",
  }
  const status = resolveFinanceCampaignStatus(row)
  assert.equal(isFinanceIncludedCampaignStatus(status), false)
  assert.equal(isFinanceExcludedCampaignStatus(status), true)

  const kept = filterPlanVersionsByIncludeDrafts([row], false)
  assert.equal(kept.length, 0)
})

test("excluded-by-status coverage follows the master, not the version snapshot", () => {
  const r = composePayables([
    {
      lineItemId: "stale-booked-se1",
      component: "media",
      amountCents: 12_000_00,
      campaignStatus: "booked",
      masterCampaignStatus: "planned",
      clientPaysForMedia: false,
    },
    {
      lineItemId: "stale-booked-se1",
      component: "fee",
      amountCents: 1_200_00,
      campaignStatus: "booked",
      masterCampaignStatus: "planned",
      clientPaysForMedia: false,
    },
  ])
  assert.equal(r.mediaHeadline, 0)
  assert.equal(r.feeCents, 0)
  assert.equal(r.excludedByStatusCents.media, 12_000_00)
  assert.equal(r.excludedByStatusCents.fee, 1_200_00)
})

test("cutArQuery has no inline campaign-status list", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../investment/cutArQuery.ts"),
    "utf8"
  )
  assert.doesNotMatch(
    src,
    /LOWER\(\s*COALESCE\(\s*v\.campaign_status/
  )
  assert.doesNotMatch(
    src,
    /IN\s*\(\s*'approved'\s*,\s*'booked'\s*,\s*'completed'\s*\)/
  )
  assert.match(src, /FINANCE_STATUS_INCLUDED_SQL/)
})
