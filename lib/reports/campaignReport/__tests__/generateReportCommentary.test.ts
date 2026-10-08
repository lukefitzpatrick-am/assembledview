import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"

import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import {
  generateReportCommentary,
  type CommentaryCompletion,
} from "@/lib/reports/campaignReport/generateReportCommentary"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"

const NOT_GENERATED = "Commentary not generated for this period."

function payload(): CampaignReportPayload {
  return {
    mbaNumber: "PENFOLD013",
    clientName: "Penfold",
    campaignName: "Penfold always on",
    versionNumber: 3,
    asOf: "2026-08-01",
    period: {
      kind: "this_month",
      slug: "this-month",
      label: "This month (August 2026)",
      current: { startISO: "2026-08-01", endISO: "2026-08-31" },
      previous: { startISO: "2026-07-01", endISO: "2026-07-31" },
    },
    totals: {
      plannedBudget: 120000,
      spend: 18450,
      impressions: 2450000,
      clicks: 18200,
      results: 900,
      previousSpend: 42100,
      previousImpressions: 5100000,
      expectedSpendToDate: 4000,
      timeElapsedPct: 0.033,
    },
    channels: [],
    kpis: [],
    commentary: null,
  }
}

const validJson = JSON.stringify({
  summary: "Search led the period and the plan is to hold it.",
  items: [
    {
      insight: "Search delivered the largest share of spend.",
      action: "Hold the search mix this month.",
      actionOwner: "Assembled",
      outcome: "Spend stays with the plan.",
      outcomeKind: "expected",
    },
    {
      insight: "Social trailed search on delivery.",
      action: "Review social creative next week.",
      actionOwner: "Meta",
      outcome: "Delivery is measured again next period.",
      outcomeKind: "expected",
    },
  ],
})

const inventedJson = JSON.stringify({
  summary: "Search led the period.",
  items: [
    {
      insight: "Search delivered the largest share of spend.",
      action: "Hold the search mix this month.",
      actionOwner: "Assembled",
      outcome: "Move $999,999 into search.",
      outcomeKind: "expected",
    },
    {
      insight: "Social trailed search on delivery.",
      action: "Review social creative next week.",
      actionOwner: "Meta",
      outcome: "Delivery is measured again next period.",
      outcomeKind: "expected",
    },
  ],
})

async function slideText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  const parts = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  const xml = await Promise.all(parts.map((name) => zip.file(name)!.async("string")))
  return xml.join("\n")
}

test("valid JSON renders on the commentary slide", async () => {
  const seen: string[] = []
  const complete: CommentaryCompletion = async ({ system, user }) => {
    seen.push(`${system}\n${user}`)
    return validJson
  }
  const commentary = await generateReportCommentary(
    { mbaNumber: "PENFOLD013", period: payload().period, reportData: payload() },
    {
      complete,
      loadPriors: async () => [],
      loadPublishedRead: async () => null,
    },
  )
  assert.ok(commentary)
  assert.equal(commentary!.items.length, 2)
  assert.match(seen[0]!, /Stage 2: commentary/)
  assert.equal(seen.length, 1)

  const deck = await buildCampaignReportDeck({ ...payload(), commentary })
  const text = await slideText(deck)
  assert.match(text, /Search delivered the largest share of spend/)
  assert.doesNotMatch(text, /PLACEHOLDER/)
})

test("an invented dollar figure is rejected and then retried", async () => {
  const users: string[] = []
  let calls = 0
  const complete: CommentaryCompletion = async ({ user }) => {
    calls += 1
    users.push(user)
    return calls === 1 ? inventedJson : validJson
  }
  const commentary = await generateReportCommentary(
    { mbaNumber: "PENFOLD013", period: payload().period, reportData: payload() },
    {
      complete,
      loadPriors: async () => [],
      loadPublishedRead: async () => null,
    },
  )
  assert.equal(calls, 2)
  assert.match(users[1]!, /\$999,999/)
  assert.equal(commentary?.items[0]?.outcome, "Spend stays with the plan.")
})

test("two failures return null and the deck shows the not-generated line", async () => {
  const complete: CommentaryCompletion = async () => inventedJson
  const commentary = await generateReportCommentary(
    { mbaNumber: "PENFOLD013", period: payload().period, reportData: payload() },
    {
      complete,
      loadPriors: async () => [],
      loadPublishedRead: async () => null,
    },
  )
  assert.equal(commentary, null)
  const deck = await buildCampaignReportDeck(payload())
  const text = await slideText(deck)
  assert.match(text, new RegExp(NOT_GENERATED.replace(/[.]/g, "\\.")))
})

test("a timeout returns null and does not retry", async () => {
  let calls = 0
  const complete: CommentaryCompletion = ({ signal }) => {
    calls += 1
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const err = new Error("aborted")
        err.name = "AbortError"
        reject(err)
      })
    })
  }
  const commentary = await generateReportCommentary(
    { mbaNumber: "PENFOLD013", period: payload().period, reportData: payload() },
    {
      complete,
      loadPriors: async () => [],
      loadPublishedRead: async () => null,
      timeoutMs: 30,
    },
  )
  assert.equal(commentary, null)
  assert.equal(calls, 1)
})
