import assert from "node:assert/strict"
import test from "node:test"

import {
  alreadySentAaWarnings,
  buildAaPublishWarnings,
  pressInsertionWarnings,
  type SentAaPack,
} from "@/lib/finance/billingPartner/publishWarnings"

const novemberPack: SentAaPack = {
  billingMonth: "2026-11-01",
  versionId: 40,
  sentAt: "2026-11-17T00:00:00.000Z",
  aaAmountsByMonth: { "2026-10": 100, "2026-11": 50 },
}

test("press: a burst longer than six days with quantity 2 or more warns", () => {
  const messages = pressInsertionWarnings([
    {
      lineId: "krusty002NP1",
      bursts: [
        { startDate: "2026-10-01", endDate: "2026-10-14", calculatedValue: 2 },
      ],
    },
  ])
  assert.deepEqual(messages, [
    "Press line krusty002NP1: enter one burst per insertion week so AA can book each insertion.",
  ])
})

test("press: a single-week burst does not warn", () => {
  const messages = pressInsertionWarnings([
    {
      lineId: "krusty002NP1",
      bursts: [
        { startDate: "2026-10-05", endDate: "2026-10-11", calculatedValue: 4 },
      ],
    },
  ])
  assert.deepEqual(messages, [])
})

test("press: quantity under 2 does not warn", () => {
  const messages = pressInsertionWarnings([
    {
      lineId: "krusty002NP1",
      bursts: [
        { startDate: "2026-10-01", endDate: "2026-10-20", calculatedValue: 1 },
      ],
    },
  ])
  assert.deepEqual(messages, [])
})

test("press: a non-press line does not warn", () => {
  const messages = buildAaPublishWarnings({
    channels: [
      {
        billingKey: "television",
        lineItems: [
          {
            line_item_id: "krusty002TV1",
            bursts: [
              { startDate: "2026-10-01", endDate: "2026-10-20", calculatedValue: 8 },
            ],
          },
        ],
      },
    ],
    billingSchedule: [],
    publishers: [],
    sentPacks: [],
  })
  assert.deepEqual(messages, [])
})

test("sent: a plan that was never sent does not warn", () => {
  const messages = alreadySentAaWarnings({
    nextAaAmountsByMonth: { "2026-11": 80 },
    sentPacks: [],
  })
  assert.deepEqual(messages, [])
})

test("sent: a changed month covered by the pack, or earlier, warns", () => {
  const messages = alreadySentAaWarnings({
    nextAaAmountsByMonth: { "2026-10": 120, "2026-11": 50, "2026-12": 999 },
    sentPacks: [novemberPack],
  })
  assert.deepEqual(messages, [
    "This changes October 2026, which AA has already received. Let AA know before the 26th.",
  ])
})

test("sent: an unchanged covered month does not warn", () => {
  const messages = alreadySentAaWarnings({
    nextAaAmountsByMonth: { "2026-10": 100, "2026-11": 50 },
    sentPacks: [novemberPack],
  })
  assert.deepEqual(messages, [])
})

test("sent: a later pack is the baseline for months it covers", () => {
  const messages = alreadySentAaWarnings({
    nextAaAmountsByMonth: { "2026-10": 100, "2026-11": 70 },
    sentPacks: [
      {
        billingMonth: "2026-10-01",
        versionId: 10,
        sentAt: "2026-10-17T00:00:00.000Z",
        aaAmountsByMonth: { "2026-10": 40 },
      },
      novemberPack,
    ],
  })
  assert.deepEqual(messages, [
    "This changes November 2026, which AA has already received. Let AA know before the 26th.",
  ])
})
