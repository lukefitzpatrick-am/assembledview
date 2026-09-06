/**
 * MR-12 — accept → editor card must look like a planner built it.
 * Simulates stamp → Postgres reassembly → OOH/Radio hydrate.
 */
import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { buildIngestReviewFromFile } from "../buildIngestReview"
import { hydrateOohEditorLine } from "../hydrateEditorCard"
import { loadSeedPublisherProfiles } from "../loadPublisherProfiles"
import { stampProposalForSave } from "../stampProposalForSave"
import type { SavePlanLineItem } from "@/lib/data/savePlan"

const FIX = path.join(process.cwd(), "tests/fixtures/ava-plans")

const CAMPAIGN_START = new Date(2026, 7, 1) // 01/08 — the empty-card default
const CAMPAIGN_END = new Date(2026, 7, 31)
const JCD_CAMPAIGN_START = new Date(2026, 6, 1) // 1 Jul 2026 (glenda008)
const JCD_CAMPAIGN_END = new Date(2027, 5, 30) // 30 Jun 2027

function assembleStamped(line: SavePlanLineItem, mba: string) {
  return mapLineItemFromPostgres(
    {
      id: 1,
      channel: line.channel,
      lineItemId: line.lineItemId,
      position: line.position ?? 0,
      market: line.market,
      buyingDemo: line.buyingDemo,
      buyType: line.buyType,
      publisher: line.publisher,
      platform: line.platform ?? null,
      bidStrategy: line.bidStrategy ?? null,
      fixedCostMedia: line.fixedCostMedia ?? false,
      clientPaysForMedia: line.clientPaysForMedia ?? false,
      budgetIncludesFees: line.budgetIncludesFees ?? false,
      noAdserving: line.noAdserving ?? true,
      bursts: line.bursts,
      attrs: line.attrs ?? {},
    },
    {
      versionId: 1,
      versionNumber: 1,
      mbaNumber: mba,
      mpClientName: "Test",
    },
  )
}

async function stampFixture(file: string, mba: string) {
  const review = await buildIngestReviewFromFile(
    path.join(FIX, file),
    loadSeedPublisherProfiles(),
    { skipAva: true },
  )
  assert.ok(review.proposal, `${file} missing proposal`)
  const stamped = stampProposalForSave(review.proposal!, mba)
  assert.ok(stamped.lineItems.length > 0, `${file} stamped zero lines`)
  return { review, stamped }
}

function assertPopulatedOohCard(
  line: SavePlanLineItem,
  mba: string,
  label: string,
) {
  const assembled = assembleStamped(line, mba)
  const card = hydrateOohEditorLine(assembled, {
    campaignStartDate: CAMPAIGN_START,
    campaignEndDate: CAMPAIGN_END,
    feePct: 0,
  })
  assert.ok(card.network.trim(), `${label}: Network empty`)
  assert.equal(card.buyType, "fixed_cost", `${label}: buyType ${card.buyType}`)
  assert.ok(card.market.trim(), `${label}: Market empty`)
  assert.ok(card.bursts.length > 0, `${label}: no bursts`)
  const money = card.bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
  assert.ok(money > 0, `${label}: money ${money}`)
  const first = card.bursts[0]!
  const start = first.startDate
  assert.ok(start instanceof Date && !Number.isNaN(start.getTime()))
  const isCampaignDefault =
    start.getFullYear() === 2026 &&
    start.getMonth() === 7 &&
    start.getDate() === 1 &&
    money === 0
  assert.equal(
    isCampaignDefault,
    false,
    `${label}: still the empty 01/08–31/08 $0 default burst`,
  )
}

test("hydrateOohEditorLine with an unresolvable buy type returns null and carries the raw", () => {
  const card = hydrateOohEditorLine(
    {
      publisher: "QMS",
      buyType: "zzzz-not-a-buy-type",
      attrs: { network: "QMS" },
    },
    {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    },
  )
  assert.equal(card.buyType, null)
  assert.notEqual(card.buyType, "")
  assert.equal(card.attrs?.buyType_unresolved_raw, "zzzz-not-a-buy-type")
})

test("JCD accept→editor: 95 buy-row lines (not occupancy subtotals), each card from its own row, money sums to file total", async () => {
  const { review, stamped } = await stampFixture(
    "jcd_strength-meals_ooh.xlsx",
    "glenda0090h1",
  )
  assert.equal(stamped.lineItems.length, 95)
  assert.equal(stamped.panels.length, 95)
  const stated = review.proposal!.reconciliation.file_stated_total ?? 0
  assert.ok(Math.abs(stated - 131250.01) < 1)

  let moneySum = 0
  const sourceRows = new Set<string>()
  const lineIds = new Set<string>()
  let paidCards = 0
  for (let i = 0; i < stamped.lineItems.length; i++) {
    const line = stamped.lineItems[i]!
    const panel = stamped.panels[i]!
    assert.equal(panel.lineItemId, line.lineItemId)
    assert.equal(line.attrs?.buy_granularity, "panel")
    assert.ok(panel.sourceRowRef, `JCD[${i}]: missing sourceRowRef`)
    sourceRows.add(panel.sourceRowRef!)
    lineIds.add(line.lineItemId)
    const assembled = assembleStamped(line, "glenda0090h1")
    const card = hydrateOohEditorLine(assembled, {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    })
    assert.ok(card.network.trim(), `JCD[${i}]: Network empty`)
    const rawFormat = String(card.attrs?.publisher_format_name ?? "").trim()
    assert.ok(rawFormat, `JCD[${i}]: publisher_format_name missing`)
    assert.notEqual(rawFormat, "large_format")
    assert.notEqual(card.format, "retail", `JCD[${i}]: RAIL must not become retail`)
    if (/RAIL/i.test(rawFormat)) {
      assert.equal(card.format, null, `JCD[${i}]: RAIL stays unresolved`)
      assert.ok(
        String(card.attrs?.format_unresolved_raw ?? "").match(/RAIL/i),
        `JCD[${i}]: RAIL unresolved raw missing`,
      )
    } else if (/SMALL FORMAT/i.test(rawFormat)) {
      assert.equal(card.format, "small_format", `JCD[${i}]: ${card.format}`)
    } else {
      assert.equal(card.format, "large_format", `JCD[${i}]: format ${card.format}`)
    }
    assert.ok(
      String(panel.publisherFormatName ?? "").trim() || rawFormat,
      `JCD[${i}]: panel publisherFormatName missing`,
    )
    assert.ok(card.market.trim(), `JCD[${i}]: Market empty`)
    assert.ok(card.bursts.length > 0, `JCD[${i}]: no bursts`)
    const money = card.bursts.reduce((s, b) => s + parseBurstMoney(b.budget), 0)
    if (line.buyType === "bonus") {
      assert.equal(card.buyType, "bonus", `JCD[${i}]: bonus line must hydrate Bonus`)
      assert.equal(money, 0, `JCD[${i}]: bonus line must stay $0`)
    } else {
      assert.equal(
        card.buyType,
        "fixed_cost",
        `JCD[${i}]: buyType ${card.buyType}`,
      )
      assert.ok(money > 0, `JCD[${i}]: fixed line must have money`)
    }
    moneySum += money
    if (money > 0) paidCards++
  }
  const formatCounts = { large_format: 0, small_format: 0, rail_unresolved: 0 }
  const rawHeaderCounts = new Map<string, number>()
  for (const line of stamped.lineItems) {
    const assembled = assembleStamped(line, "glenda0090h1")
    const card = hydrateOohEditorLine(assembled, {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    })
    const raw = String(card.attrs?.publisher_format_name ?? "").trim()
    rawHeaderCounts.set(raw, (rawHeaderCounts.get(raw) ?? 0) + 1)
    if (card.format === "large_format") formatCounts.large_format++
    else if (card.format === "small_format") formatCounts.small_format++
    else if (card.format == null && /RAIL/i.test(raw)) {
      formatCounts.rail_unresolved++
    }
  }
  assert.equal(formatCounts.large_format, 80)
  assert.equal(formatCounts.rail_unresolved, 14)
  assert.equal(formatCounts.small_format, 1)
  assert.equal(rawHeaderCounts.get("JCDecaux DIGITAL LARGE FORMAT"), 80)
  assert.equal(rawHeaderCounts.get("JCDecaux RAIL"), 14)
  assert.equal(rawHeaderCounts.get("JCDecaux DIGITAL SMALL FORMAT"), 1)
  const bonusCount = stamped.lineItems.filter((l) => l.buyType === "bonus").length
  const fixedCount = stamped.lineItems.filter(
    (l) => l.buyType === "fixed_cost",
  ).length
  assert.equal(bonusCount, 38)
  assert.equal(fixedCount, 57)
  assert.equal(paidCards, 57, "expected 57 fixed rows with money")
  assert.ok(
    Math.abs(moneySum - stated) / stated <= 0.005,
    `hydrated money ${moneySum} vs file ${stated}`,
  )
  // Per-row identity is sourceRowRef, not site+format+market. JCD repeats
  // the same site on separate buy rows (different flights); collapsing those
  // would be the old grouped model. Duplicate descriptors are expected.
  assert.equal(sourceRows.size, 95)
  assert.equal(lineIds.size, 95)
})

test("QMS accept→editor: 41 lines (supersedes grouped 3-of-41), each card from its own row", async () => {
  const { review, stamped } = await stampFixture(
    "qms_strength-meals_esb-ooh.xlsx",
    "qmsround01",
  )
  assert.equal(stamped.lineItems.length, 41)
  assert.equal(stamped.panels.length, 41)
  assert.equal(review.proposal!.reconciliation.line_item_count, 41)
  assertPopulatedOohCard(stamped.lineItems[0]!, "qmsround01", "QMS[0]")
  for (const line of stamped.lineItems) {
    const assembled = assembleStamped(line, "qmsround01")
    const card = hydrateOohEditorLine(assembled, {
      campaignStartDate: CAMPAIGN_START,
      campaignEndDate: CAMPAIGN_END,
      feePct: 0,
    })
    assert.ok(card.network.trim(), "Network empty")
    assert.equal(card.format, null, "QMS Digital must not be coerced to empty")
    assert.notEqual(card.format, "")
    const rawFormat = String(
      card.attrs?.format_unresolved_raw ??
        card.attrs?.publisher_format_name ??
        "",
    ).trim()
    assert.ok(rawFormat, "QMS unresolved format raw missing")
    assert.equal(card.attrs?.format_unresolved_raw, rawFormat)
    assert.ok(card.market.trim(), "Market empty")
    assert.ok(card.bursts.length > 0)
  }
})

function cardYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

test("hydrate campaign default only when the loaded line has no bursts at all", () => {
  const empty = hydrateOohEditorLine(
    { publisher: "JCDecaux", buyType: "bonus" },
    {
      campaignStartDate: JCD_CAMPAIGN_START,
      campaignEndDate: JCD_CAMPAIGN_END,
      feePct: 0,
    },
  )
  assert.equal(empty.bursts.length, 1)
  assert.equal(cardYmd(empty.bursts[0]!.startDate), "2026-07-01")
  assert.equal(cardYmd(empty.bursts[0]!.endDate), "2027-06-30")

  const existing = hydrateOohEditorLine(
    {
      publisher: "JCDecaux",
      buyType: "bonus",
      bursts: [
        {
          budget: "0",
          buyAmount: "0",
          startDate: "not-a-date",
          endDate: "also-bad",
          calculatedValue: 0,
        },
      ],
    },
    {
      campaignStartDate: JCD_CAMPAIGN_START,
      campaignEndDate: JCD_CAMPAIGN_END,
      feePct: 0,
    },
  )
  assert.ok(existing.bursts.length >= 1, "existing burst list must not be dropped")
  for (const burst of existing.bursts) {
    assert.notEqual(
      `${cardYmd(burst.startDate)}→${cardYmd(burst.endDate)}`,
      "2026-07-01→2027-06-30",
      "hydrate must not substitute campaign dates onto an existing burst",
    )
  }
})

test("JCD hydrate with Jul–Jun campaign keeps file B weeks, not campaign dates", async () => {
  const { stamped } = await stampFixture(
    "jcd_strength-meals_ooh.xlsx",
    "glenda0080h1",
  )
  const campaignDated: string[] = []
  for (let i = 0; i < stamped.lineItems.length; i++) {
    const line = stamped.lineItems[i]!
    const assembled = assembleStamped(line, "glenda0080h1")
    const card = hydrateOohEditorLine(assembled, {
      campaignStartDate: JCD_CAMPAIGN_START,
      campaignEndDate: JCD_CAMPAIGN_END,
      feePct: 0,
    })
    for (const burst of card.bursts) {
      const span = `${cardYmd(burst.startDate)}→${cardYmd(burst.endDate)}`
      if (span === "2026-07-01→2027-06-30") {
        campaignDated.push(String(stamped.panels[i]?.sourceRowRef ?? i))
      }
    }
  }
  assert.deepEqual(campaignDated, [], `campaign-dated bursts: ${campaignDated.join(", ")}`)

  function cardAtRow(n: number) {
    const i = stamped.panels.findIndex((p) =>
      (p.sourceRowRef ?? "").endsWith(`!r${n}`),
    )
    assert.ok(i >= 0, `missing r${n}`)
    return hydrateOohEditorLine(assembleStamped(stamped.lineItems[i]!, "glenda0080h1"), {
      campaignStartDate: JCD_CAMPAIGN_START,
      campaignEndDate: JCD_CAMPAIGN_END,
      feePct: 0,
    })
  }
  const brookvale = cardAtRow(30)
  assert.equal(brookvale.bursts.length, 1)
  assert.equal(cardYmd(brookvale.bursts[0]!.startDate), "2027-02-15")
  assert.equal(cardYmd(brookvale.bursts[0]!.endDate), "2027-02-21")

  const bundoora = cardAtRow(62)
  assert.equal(bundoora.bursts.length, 2)
  const paid = bundoora.bursts.find((b) => parseBurstMoney(b.budget) > 0)
  const bonus = bundoora.bursts.find((b) => parseBurstMoney(b.budget) === 0)
  assert.ok(paid && bonus)
  assert.equal(cardYmd(paid!.startDate), "2026-10-26")
  assert.equal(cardYmd(paid!.endDate), "2026-11-01")
  assert.ok(Math.abs(parseBurstMoney(paid!.budget) - 306.08) < 0.005)
  assert.equal(cardYmd(bonus!.startDate), "2027-03-15")
  assert.equal(cardYmd(bonus!.endDate), "2027-03-21")
})
