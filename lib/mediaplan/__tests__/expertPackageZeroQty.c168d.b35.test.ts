/**
 * B35 (C-168 (d)): a card package line with quantity 0 opened in the press or
 * programmatic expert grid stays 0 (it opened as 1), and Apply never invents a
 * quantity: the grid generates no burst for it and the card's bursts are kept
 * (`preservePreviousBurstsIfApplyWouldZeroBudget`), so a $750 line stays $750
 * (it became 1 x $250 = $250). A quantity entered in the grid still prices as
 * quantity x rate. Fixed cost and package inclusions still open as 1
 * (C-168 (c) is still open). Create and edit share these containers.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import * as maps from "@/lib/mediaplan/expertChannelMappings"
import * as merge from "@/lib/mediaplan/expertModeSwitch"
import { expertRowGrossCost, expertRowQuantitySum } from "@/lib/mediaplan/expertRowCost"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
const weekKeys = cols.map((c) => c.weekKey)

type AnyFn = (...args: any[]) => any[]
type Channel = { name: string; toExpert: AnyFn; toStandard: AnyFn; merge: AnyFn; base: Record<string, unknown> }

const press = { network: "News", publisher: "News Corp", title: "Herald Sun", size: "FP", format: "Colour", placement: "Early", buyingDemo: "", market: "Melbourne" }
const prog = { platform: "DV360", bidStrategy: "CPM", creativeTargeting: "", creative: "", buyingDemo: "", market: "" }

const CHANNELS: Channel[] = [
  { name: "Newspaper", toExpert: maps.mapStandardNewspaperLineItemsToExpertRows, toStandard: maps.mapNewspaperExpertRowsToStandardLineItems, merge: merge.mergeNewspaperStandardFromExpertWithPrevious, base: press },
  { name: "Magazines", toExpert: maps.mapStandardMagazineLineItemsToExpertRows, toStandard: maps.mapMagazineExpertRowsToStandardLineItems, merge: merge.mergeMagazineStandardFromExpertWithPrevious, base: press },
  { name: "Prog Display", toExpert: maps.mapStandardProgDisplayLineItemsToExpertRows, toStandard: maps.mapProgDisplayExpertRowsToStandardLineItems, merge: merge.mergeProgDisplayStandardFromExpertWithPrevious, base: prog },
  { name: "Prog Video", toExpert: maps.mapStandardProgVideoLineItemsToExpertRows, toStandard: maps.mapProgVideoExpertRowsToStandardLineItems, merge: merge.mergeProgVideoStandardFromExpertWithPrevious, base: prog },
  { name: "Prog Audio", toExpert: maps.mapStandardProgAudioLineItemsToExpertRows, toStandard: maps.mapProgAudioExpertRowsToStandardLineItems, merge: merge.mergeProgAudioStandardFromExpertWithPrevious, base: prog },
  { name: "Prog BVOD", toExpert: maps.mapStandardProgBvodLineItemsToExpertRows, toStandard: maps.mapProgBvodExpertRowsToStandardLineItems, merge: merge.mergeProgBvodStandardFromExpertWithPrevious, base: prog },
  { name: "Prog OOH", toExpert: maps.mapStandardProgOohLineItemsToExpertRows, toStandard: maps.mapProgOohExpertRowsToStandardLineItems, merge: merge.mergeProgOohStandardFromExpertWithPrevious, base: prog },
]

function card(ch: Channel, buyType: string, calculatedValue: number, budget = "$750.00") {
  return {
    ...ch.base,
    buyType,
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving: false,
    lineItemId: "TEST001NP1",
    line_item_id: "TEST001NP1",
    line_item: 1,
    lineItem: 1,
    bursts: [
      {
        budget,
        buyAmount: "250",
        startDate: new Date(2026, 0, 12),
        endDate: new Date(2026, 0, 18),
        calculatedValue,
        fee: 0,
      },
    ],
  }
}

const qty = (r: any): number => expertRowQuantitySum(r, weekKeys)

for (const ch of CHANNELS) {
  test(`${ch.name}: a package card with quantity 0 opens as 0 and the grid prices it $0`, () => {
    const [row] = ch.toExpert([card(ch, "package", 0)], cols, CS, CE)
    assert.ok(row)
    assert.equal(qty(row), 0)
    assert.equal(expertRowGrossCost(row, weekKeys), 0)
  })

  test(`${ch.name}: Apply of that row invents no quantity and keeps the card's $750`, () => {
    const previous = [card(ch, "package", 0)]
    const rows = ch.toExpert(previous, cols, CS, CE)
    const generated = ch.toStandard(rows, cols, CS, CE, { packageKeepsEnteredQty: true })
    assert.equal(generated[0].bursts.length === 0 || generated[0].bursts.every((b: any) => b.calculatedValue !== 1), true)
    const [line] = ch.merge(generated, previous)
    assert.equal(line.bursts.length, 1)
    assert.equal(line.bursts[0].budget, "$750.00")
    assert.equal(line.bursts[0].calculatedValue, 0)
  })

  test(`${ch.name}: a package quantity entered still prices as quantity x rate`, () => {
    const previous = [card(ch, "package", 3)]
    const rows = ch.toExpert(previous, cols, CS, CE)
    assert.equal(qty(rows[0]), 3)
    assert.equal(expertRowGrossCost(rows[0], weekKeys), 750)
    const [line] = ch.merge(ch.toStandard(rows, cols, CS, CE, { packageKeepsEnteredQty: true }), previous)
    assert.equal(line.bursts.reduce((s: number, b: any) => s + Number(String(b.budget).replace(/[^0-9.-]/g, "")), 0), 750)
    assert.equal(line.bursts.reduce((s: number, b: any) => s + Number(b.calculatedValue), 0), 3)
  })

  test(`${ch.name}: fixed cost with quantity 0 still opens as 1 (C-168 (c) unchanged)`, () => {
    const [row] = ch.toExpert([card(ch, "fixed_cost", 0)], cols, CS, CE)
    assert.equal(qty(row), 1)
  })
}
