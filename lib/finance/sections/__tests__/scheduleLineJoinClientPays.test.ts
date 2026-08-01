/**
 * FN-FIX-1 — fixture-proven dual-shape join + client-pays exclusion.
 *
 * Schedule keys are often `billing-{mediaType}::{lineId}` while line_items
 * stores bare `{lineId}`. Client-pays media must drop from delivery payables
 * after the join resolves; fee/adserving stay.
 */

import assert from "node:assert/strict"
import test from "node:test"

import { SCHEDULE_LINE_JOIN_SQL } from "../scheduleLineJoinSql.js"
import {
  CAMPAIGN_LEVEL_NO_LINE_DETAIL,
  IS_SERVICE_LINE_SQL,
  isServiceLineItemId,
  lineDimOrCampaignLevelSql,
} from "../serviceLineBucket.js"

type ScheduleCell = {
  lineItemId: string
  component: "media" | "fee" | "adserving"
  amountCents: number
}

type LineItem = {
  lineItemId: string
  clientPaysForMedia: boolean
  publisher: string
  channel: string
  buyType: string
}

/** Mirror of SCHEDULE_LINE_JOIN_SQL (exact OR suffix after `::`). */
function joinLine(sm: ScheduleCell, lines: LineItem[]): LineItem | null {
  for (const li of lines) {
    if (li.lineItemId === sm.lineItemId) return li
    const sep = sm.lineItemId.indexOf("::")
    if (sep > 0 && li.lineItemId === sm.lineItemId.slice(sep + 2)) return li
  }
  return null
}

/** Delivery payables gate — same as summaryQuery / costsQuery / cutQuery. */
function includeInDeliveryPayables(sm: ScheduleCell, li: LineItem | null): boolean {
  if (sm.component !== "media") return true
  if (!li) return true
  return li.clientPaysForMedia !== true
}

function publisherBucket(sm: ScheduleCell, li: LineItem | null): string {
  if (isServiceLineItemId(sm.lineItemId)) return CAMPAIGN_LEVEL_NO_LINE_DETAIL
  return li?.publisher ?? "Unspecified"
}

const FIXTURE_LINES: LineItem[] = [
  {
    lineItemId: "krusty004pd1",
    clientPaysForMedia: true,
    publisher: "DV360",
    channel: "prog_display",
    buyType: "CPM",
  },
  {
    lineItemId: "krusty004se1",
    clientPaysForMedia: false,
    publisher: "Google Ads",
    channel: "search",
    buyType: "CPC",
  },
]

/** Amounts in cents. */
const FIXTURE_CELLS: ScheduleCell[] = [
  {
    lineItemId: "billing-Programmatic Display::krusty004pd1",
    component: "media",
    amountCents: 500_000, // $5,000 client-pays — must EXCLUDE
  },
  {
    lineItemId: "billing-Programmatic Display::krusty004pd1",
    component: "fee",
    amountCents: 50_000, // $500 fee — INCLUDE
  },
  {
    lineItemId: "krusty004se1",
    component: "media",
    amountCents: 100_000, // $1,000 agency media — INCLUDE
  },
  {
    lineItemId: "__service__adserving",
    component: "adserving",
    amountCents: 25_000, // $250 campaign-level
  },
  {
    lineItemId: "__service__fees",
    component: "fee",
    amountCents: 10_000, // $100 campaign-level
  },
]

test("SCHEDULE_LINE_JOIN_SQL documents exact OR SPLIT_PART dual-shape", () => {
  assert.match(SCHEDULE_LINE_JOIN_SQL, /li\.line_item_id = sm\.line_item_id/)
  assert.match(SCHEDULE_LINE_JOIN_SQL, /SPLIT_PART\(sm\.line_item_id, '::', 2\)/)
  assert.match(IS_SERVICE_LINE_SQL, /__service__/)
})

test("dual-shape join resolves decorated schedule id to bare line_items id", () => {
  const sm = FIXTURE_CELLS[0]!
  const li = joinLine(sm, FIXTURE_LINES)
  assert.ok(li)
  assert.equal(li.lineItemId, "krusty004pd1")
  assert.equal(li.clientPaysForMedia, true)
})

test("client-pays media excluded on delivery; fee + agency media kept", () => {
  let total = 0
  const byPublisher = new Map<string, number>()

  for (const sm of FIXTURE_CELLS) {
    const li = joinLine(sm, FIXTURE_LINES)
    if (!includeInDeliveryPayables(sm, li)) continue
    total += sm.amountCents
    const bucket = publisherBucket(sm, li)
    byPublisher.set(bucket, (byPublisher.get(bucket) ?? 0) + sm.amountCents)
  }

  // Dropped 500_000 client-pays media; keep 50k+100k+25k+10k
  assert.equal(total, 185_000)
  assert.equal(byPublisher.get("DV360"), 50_000)
  assert.equal(byPublisher.get("Google Ads"), 100_000)
  assert.equal(byPublisher.get(CAMPAIGN_LEVEL_NO_LINE_DETAIL), 35_000)
  assert.equal(byPublisher.has("Unspecified"), false)
})

test("__service__* never attributed to publisher/channel/buyType dims", () => {
  const channelExpr = lineDimOrCampaignLevelSql("COALESCE(li.channel::text, 'Unknown')")
  const buyExpr = lineDimOrCampaignLevelSql(
    "COALESCE(NULLIF(BTRIM(li.buy_type), ''), 'Unspecified')"
  )
  assert.match(channelExpr, /campaign-level \(no line detail\)/)
  assert.match(buyExpr, /__service__/)

  for (const sm of FIXTURE_CELLS.filter((c) => isServiceLineItemId(c.lineItemId))) {
    assert.equal(publisherBucket(sm, null), CAMPAIGN_LEVEL_NO_LINE_DETAIL)
  }
})

test("lineDetailPct = non-service share of included delivery cents", () => {
  let total = 0
  let lineDetail = 0
  for (const sm of FIXTURE_CELLS) {
    const li = joinLine(sm, FIXTURE_LINES)
    if (!includeInDeliveryPayables(sm, li)) continue
    total += sm.amountCents
    if (!isServiceLineItemId(sm.lineItemId)) lineDetail += sm.amountCents
  }
  const pct = Math.round((lineDetail / total) * 1000) / 10
  assert.equal(pct, Math.round((150_000 / 185_000) * 1000) / 10)
})
