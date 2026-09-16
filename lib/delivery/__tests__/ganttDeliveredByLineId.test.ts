import assert from "node:assert/strict"
import test from "node:test"

import type { ChannelSectionData } from "@/components/dashboard/delivery/channels/types"
import type { ProgressCardProps } from "@/components/dashboard/delivery/shared/ProgressCard"
import {
  deliveredByLineIdFromChannelSections,
  deliveredByLineIdIdentity,
} from "../ganttDeliveredByLineId"

function card(
  title: string,
  value: string,
  detail: string,
): ProgressCardProps {
  return {
    title,
    value,
    detail,
    progress: 0.4,
    variance: 0,
    status: "on-track",
  }
}

function section(
  key: ChannelSectionData["key"],
  lineId: string,
  cards: [ProgressCardProps, ProgressCardProps],
): ChannelSectionData {
  return {
    key,
    title: key,
    dateRange: { startISO: "2026-01-01", endISO: "2026-06-01" },
    lastSyncedAt: null,
    connections: [],
    mediaTypeColour: "var(--channel-search)",
    aggregate: {
      summaryChips: [],
      progressCards: cards,
      kpiBand: { tiles: [] },
      chart: { daily: [], series: [], asAtDate: null },
    },
    lineItems: [
      {
        id: lineId,
        block: {
          name: lineId,
          progressCards: cards,
          kpiBand: { tiles: [] },
          chart: { kind: "daily-delivery", daily: [], series: [], asAtDate: null },
        },
      },
    ],
  }
}

test("extracts accordion deliverable counts keyed by cleaned line id", () => {
  const map = deliveredByLineIdFromChannelSections([
    section("social-meta", "LI-1", [
      card("Spend delivery", "$100.00", "Delivered $100.00 · Planned $200.00"),
      card("Impressions delivery", "400", "Delivered 400 · Planned 1,000"),
    ]),
  ])
  assert.equal(map.get("li-1"), 400)
  assert.equal(map.size, 1)
})

test("direct digital uses the impressions card, not clicks", () => {
  const map = deliveredByLineIdFromChannelSections([
    section("digital-display", "cm360-1", [
      card("Impressions", "12,500", "Delivered 12,500 · Planned 20,000"),
      card("Clicks", "80", "Delivered 80 · Planned 100"),
    ]),
  ])
  assert.equal(map.get("cm360-1"), 12500)
})

test("plan-only and no-delivery details are omitted", () => {
  const map = deliveredByLineIdFromChannelSections([
    section("plan-only", "awaiting-1", [
      card("Spend", "—", "No delivery data yet"),
      card("Deliverable", "—", "No delivery data yet"),
    ]),
  ])
  assert.equal(map.size, 0)
})

test("identity is stable for the same pairs in any order", () => {
  const a = new Map([
    ["b", 2],
    ["a", 1],
  ])
  const b = new Map([
    ["a", 1],
    ["b", 2],
  ])
  assert.equal(deliveredByLineIdIdentity(a), deliveredByLineIdIdentity(b))
})
