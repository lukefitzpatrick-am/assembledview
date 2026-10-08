/**
 * One fixture set. Each money surface is checked in cents.
 * A disagreement is a todo with the numbers. It does not fail the suite and it is not fixed here.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

import ExcelJS from "exceljs"

import { computeAdServingCost } from "@/lib/billing/computeAdServingCost"
import { explodeExcelLineItems } from "@/lib/docs/explodeExcelLineItems"
import { buildMediaPlanWorkbook } from "@/lib/docs/mediaPlanWorkbook"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import type { MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"
import {
  buildMediaPlanWorkbookMbaData,
  MEDIA_PLAN_WORKBOOK_FLAG_TO_BILLING_KEY,
  MEDIA_PLAN_WORKBOOK_MEDIA_TYPES,
} from "@/lib/mediaplan/buildMediaPlanWorkbookMbaData"
import { lineTotals } from "@/lib/money/burst"
import { sumCents, toCents } from "@/lib/money/cents"
import { parseMoney } from "@/lib/money/parse"
import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  totalPlannedSpendFromDeliveryScheduleMonthly,
} from "@/lib/spend/monthlyPlanCalendar"

import { GOLDEN_PLANS } from "./fixtures/plans"

type Check = { name: string; ok: boolean; actual: number; expected: number }

const BILLING_KEY_TO_FLAG: Record<string, string> = Object.fromEntries(
  Object.entries(MEDIA_PLAN_WORKBOOK_FLAG_TO_BILLING_KEY).map(([flag, key]) => [key, flag]),
)

const MEDIA_KEY: Record<string, keyof MediaItems> = {
  search: "search",
  social: "socialMedia",
  television: "television",
  ooh: "ooh",
  digiDisplay: "digiDisplay",
  production: "production",
}

function emptyItems(): MediaItems {
  return {
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
}

function dollarsToCents(value: number): number {
  return toCents(value)
}

function scheduleCents(value: string): number {
  return toCents(parseMoney(value) ?? 0)
}

function totalsFor(lines: LineItemInput[]) {
  const parts = lines.map((item) =>
    lineTotals(
      {
        mediaType: item.mediaType,
        buyType: item.buyType,
        budgetIncludesFees: item.budgetIncludesFees,
        clientPaysForMedia: item.clientPaysForMedia,
        bursts: item.bursts.map((burst) => ({
          budget: burst.budget,
          buyType: item.buyType,
        })),
      },
      { feePct: item.feePct ?? 0, budgetIncludesFees: item.budgetIncludesFees, clientPaysForMedia: item.clientPaysForMedia },
    ),
  )
  return {
    mediaCents: sumCents(parts.map((part) => part.mediaCents)),
    feeCents: sumCents(parts.map((part) => part.feeCents)),
    totalCents: sumCents(parts.map((part) => part.totalCents)),
    clientPaysMediaCents: sumCents(parts.map((part) => part.clientPaysMediaCents)),
    productionCents: sumCents(parts.map((part) => part.productionCents)),
  }
}

function headerFor(start: string, end: string): MediaPlanHeader {
  const [ys, ms, ds] = start.split("-")
  const [ye, me, de] = end.split("-")
  return {
    logoBase64: readFileSync(join(process.cwd(), "public/brand/logo-full-colour.png")).toString("base64"),
    logoWidth: 180,
    logoHeight: 40,
    client: "Golden",
    brand: "Golden",
    campaignName: "Golden",
    mbaNumber: "GOLDEN001",
    clientContact: "",
    planVersion: "1",
    poNumber: "",
    campaignBudget: "0",
    campaignStatus: "Draft",
    campaignStart: `${ds}/${ms}/${ys}`,
    campaignEnd: `${de}/${me}/${ye}`,
  }
}

function check(name: string, actual: number, expected: number): Check {
  return { name, ok: actual === expected, actual, expected }
}

async function collect(): Promise<Check[]> {
  const checks: Check[] = []
  for (const plan of GOLDEN_PLANS) {
    const lines = plan.lines as unknown as LineItemInput[]
    const totals = totalsFor(lines)
    const financials = computeCampaignFinancials(lines, { feeLoading: {} }, {
      getRateForMediaType: (mediaType) => (mediaType === "digiDisplay" ? 2.5 : 0),
    })
    const scope = financials.mbaScopeTotals
    checks.push(
      check(
        `${plan.id} gross media equals billed plus client-paid`,
        totals.mediaCents + totals.clientPaysMediaCents,
        dollarsToCents(scope.grossMedia),
      ),
    )
    checks.push(check(`${plan.id} fee cents`, totals.feeCents, dollarsToCents(scope.fee)))
    checks.push(
      check(
        `${plan.id} production cents`,
        totals.productionCents,
        dollarsToCents(scope.production),
      ),
    )

    const monthParts = financials.billingSchedule.reduce(
      (sum, month) =>
        sum +
        scheduleCents(month.mediaTotal) +
        scheduleCents(month.feeTotal) +
        scheduleCents(month.adservingTechFees) +
        scheduleCents(month.production),
      0,
    )
    const monthTotals = financials.billingSchedule.reduce(
      (sum, month) => sum + scheduleCents(month.totalAmount),
      0,
    )
    checks.push(check(`${plan.id} billing month parts equal month totals`, monthParts, monthTotals))

    const items = emptyItems()
    lines.forEach((item, index) => {
      const key = MEDIA_KEY[item.mediaType]
      if (!key) return
      items[key].push(
        ...explodeExcelLineItems(
          key,
          {
            line_item_id: item.lineItemId,
            buyType: item.buyType,
            budgetIncludesFees: item.budgetIncludesFees,
            clientPaysForMedia: item.clientPaysForMedia,
            bursts: item.bursts,
          },
          item.feePct ?? 0,
          index,
        ),
      )
    })
    const formFlags: Record<string, boolean> = {}
    const mediaByKey: Record<string, number> = {}
    for (const line of financials.perLine) {
      if (line.flags.excluded) continue
      mediaByKey[line.mediaType] = (mediaByKey[line.mediaType] ?? 0) + line.media
      const flag = BILLING_KEY_TO_FLAG[line.mediaType]
      if (flag) formFlags[flag] = true
    }
    const mbaData = buildMediaPlanWorkbookMbaData({
      mediaTypes: MEDIA_PLAN_WORKBOOK_MEDIA_TYPES,
      formFlags,
      campaignFinancialsMediaByKey: mediaByKey,
      mbaScopeTotals: scope,
    })
    const { buffer } = await buildMediaPlanWorkbook({
      header: headerFor(plan.campaignStart, plan.campaignEnd),
      mediaItems: items,
      mbaData,
      variant: "standard",
      draft: false,
      clientName: "Golden",
      campaignName: "Golden",
      versionNumber: 1,
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet("Media Plan")
    let totalN = 0
    let monthSum = 0
    sheet?.eachRow((row) => {
      if (String(row.getCell(2).value ?? "") !== "Total") return
      totalN = Number(row.getCell(14).value ?? 0)
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (col < 15 || typeof cell.value !== "number") return
        const master = (cell as { master?: { address?: string } }).master?.address
        if (master && master !== cell.address) return
        monthSum += cell.value
      })
    })
    checks.push(
      check(
        `${plan.id} workbook Total Ex GST cents`,
        toCents(totalN),
        dollarsToCents(scope.nettExGst),
      ),
    )
    checks.push(
      check(
        `${plan.id} workbook Total row months sum to Total Ex GST`,
        toCents(Math.round(monthSum * 100) / 100),
        toCents(totalN),
      ),
    )
  }

  const f6 = computeCampaignFinancials(GOLDEN_PLANS[5].lines as unknown as LineItemInput[], { feeLoading: {} })
  const planned = totalPlannedSpendFromDeliveryScheduleMonthly(f6.deliverySchedule, {
    campaignStartISO: "2026-01-17",
    campaignEndISO: "2026-03-31",
    basis: "media",
  })
  checks.push(check("F6 planned media", dollarsToCents(planned), 7_400_000))
  const asOf = (iso: string, expectedCents: number) => {
    const expected = expectedSpendToDateFromDeliveryScheduleMonthly(f6.deliverySchedule, {
      campaignStartISO: "2026-01-17",
      campaignEndISO: "2026-03-31",
      asOfISO: iso,
      basis: "media",
    })
    checks.push(check(`F6 expected media ${iso}`, dollarsToCents(expected), expectedCents))
  }
  asOf("2026-01-20", 400_000)
  asOf("2026-02-10", 2_500_000)
  asOf("2026-03-31", 7_400_000)
  asOf("2026-01-16", 0)

  const serving = [100000, 100000].reduce(
    (sum, quantity) =>
      sum +
      computeAdServingCost({
        quantity,
        buyType: "cpm",
        mediaType: "digiDisplay",
        rate: 2.5,
      }),
    0,
  )
  const f8 = computeCampaignFinancials(GOLDEN_PLANS[7].lines as unknown as LineItemInput[], { feeLoading: {} }, {
    getRateForMediaType: () => 2.5,
  })
  checks.push(check("F8 ad serving cents", dollarsToCents(f8.mbaScopeTotals.adServing), dollarsToCents(serving)))
  checks.push(check("F3 fee includes the client-pays fee", totalsFor(GOLDEN_PLANS[2].lines as unknown as LineItemInput[]).feeCents, dollarsToCents(
    computeCampaignFinancials(GOLDEN_PLANS[2].lines as unknown as LineItemInput[], { feeLoading: {} }).mbaScopeTotals.fee,
  )))

  return checks
}

const checks = await collect()

for (const item of checks) {
  if (item.ok) {
    test(item.name, () => {
      assert.equal(item.actual, item.expected)
    })
  } else {
    test.todo(`${item.name}: got ${item.actual}, expected ${item.expected}`)
  }
}

test.todo("buildMbaFromPersisted is not compared: it needs a persisted version and a database")
