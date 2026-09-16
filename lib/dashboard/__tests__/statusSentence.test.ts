import assert from "node:assert/strict"
import test from "node:test"

import { formatMoney } from "../../format/money.js"
import { statusSentence } from "../statusSentence.js"

const BASE = {
  pacingStatus: "on-track",
  spendPct: 0.4,
  impressionsPct: 0.4,
} as const

test("rule a: partial channels and low spend", () => {
  assert.equal(
    statusSentence({
      ...BASE,
      channelsReporting: 2,
      channelsTotal: 5,
      spendPct: 0.2,
    }),
    "2 of 5 channels are reporting so far, which is why delivered spend looks low.",
  )
})

test("rule a with ahead clause: reporting channel ahead on the card measure", () => {
  assert.equal(
    statusSentence({
      ...BASE,
      channelsReporting: 2,
      channelsTotal: 5,
      spendPct: 0.2,
      aheadChannelName: "Social Meta",
    }),
    "2 of 5 channels are reporting so far, which is why delivered spend looks low. Social Meta is ahead.",
  )
})

test("rule a drops the ahead clause when no channel is ahead on the card measure", () => {
  assert.equal(
    statusSentence({
      ...BASE,
      channelsReporting: 2,
      channelsTotal: 5,
      spendPct: 0.2,
      aheadChannelName: null,
    }),
    "2 of 5 channels are reporting so far, which is why delivered spend looks low.",
  )
})

test("rule b: impressions ahead of spend and cheaper CPM", () => {
  assert.equal(
    statusSentence({
      pacingStatus: "behind",
      spendPct: 0.4,
      impressionsPct: 0.6,
      cpmActual: 8,
      cpmPlanned: 12,
      expectedSpend: 50_000,
      actualSpend: 10_000,
    }),
    "Delivery is ahead on impressions and under on spend because media is buying cheaper than planned.",
  )
})

test("rule c: behind spend (and critical / over-pacing)", () => {
  const behind = statusSentence({
    pacingStatus: "behind",
    spendPct: 0.8,
    impressionsPct: 0.8,
    expectedSpend: 10_000,
    actualSpend: 4_000,
  })
  assert.equal(
    behind,
    `Spend is behind the plan by ${formatMoney(6_000, { decimals: 0 })}. See the channel cards below for where.`,
  )

  const critical = statusSentence({
    pacingStatus: "over-pacing",
    spendPct: 0.9,
    impressionsPct: 0.9,
    expectedSpend: 10_000,
    actualSpend: 4_000,
  })
  assert.equal(critical, behind)
})

test("rule d: otherwise on track", () => {
  assert.equal(
    statusSentence({
      pacingStatus: "on-track",
      spendPct: 0.7,
      impressionsPct: 0.72,
    }),
    "Delivery is on track against the plan.",
  )
})

test("unknown total skips rule a", () => {
  assert.equal(
    statusSentence({
      pacingStatus: "on-track",
      spendPct: 0.1,
      impressionsPct: 0.1,
      channelsReporting: 1,
    }),
    "Delivery is on track against the plan.",
  )
})

test("rule b skipped when CPM is absent", () => {
  assert.equal(
    statusSentence({
      pacingStatus: "on-track",
      spendPct: 0.4,
      impressionsPct: 0.7,
    }),
    "Delivery is on track against the plan.",
  )
})
