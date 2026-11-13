/**
 * B35fix (B35 review L2 and L4, C-168).
 *
 * L2: a card package line with one burst at quantity 0 ($750) and one with a
 * quantity (2 x $250 = $500). Base Apply gave $750 (the 0 opened as 1, so
 * $250 for it); B35 gave $500 (the 0 burst was dropped). Apply now keeps the
 * zero burst's own money and dates and prices the quantity burst as quantity
 * x rate: $1,250, nothing lost either way. A quantity typed into the zero
 * burst's week prices as quantity x rate in its place. Seven channels
 * (Newspaper, Magazines, five programmatic), with `expert_package_quantity`
 * on and off. Create and edit share these containers.
 *
 * L4: the zero-package skip in the card budget projection applies to
 * `package` rows only.
 */
import { test } from "node:test"
import assert from "node:assert/strict"

import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import * as maps from "@/lib/mediaplan/expertChannelMappings"
import * as merge from "@/lib/mediaplan/expertModeSwitch"
import {
  keepZeroQuantityPackageBurstsOnApply,
  projectLumpSumCardBudgetsOntoExpertRows,
} from "@/lib/mediaplan/cardExpertBudgetSync"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"

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

type Burst = { budget: string; buyAmount: string; startDate: Date; endDate: Date; calculatedValue: number; fee: number }
const burst = (budget: string, from: number, to: number, calculatedValue: number): Burst => ({
  budget,
  buyAmount: "250",
  startDate: new Date(2026, 0, from),
  endDate: new Date(2026, 0, to),
  calculatedValue,
  fee: 0,
})

function card(ch: Channel, bursts: Burst[], buyType = "package") {
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
    bursts,
  }
}

const money = (v: unknown) => Number(String(v).replace(/[^0-9.-]/g, ""))
const total = (bursts: any[]) => bursts.reduce((s, b) => s + money(b.budget), 0)
const day = (d: unknown) => formatBurstDateLocal(d as Date)
const shape = (bursts: any[]) => bursts.map((b) => [day(b.startDate), money(b.budget), Number(b.calculatedValue)])

function apply(ch: Channel, previous: any[], packageKeepsEnteredQty: boolean, editRows?: (rows: any[]) => void) {
  const rows = ch.toExpert(previous, cols, CS, CE)
  editRows?.(rows)
  const generated = ch.toStandard(rows, cols, CS, CE, { packageKeepsEnteredQty })
  return ch.merge(generated, previous)
}

const mixed = () => [burst("$750.00", 12, 18, 0), burst("$500.00", 19, 25, 2)]

for (const ch of CHANNELS) {
  for (const on of [true, false]) {
    test(`${ch.name} (package quantity switch ${on ? "on" : "off"}): mixed 0 and quantity bursts keep $750 + 2 x $250`, () => {
      const previous = [card(ch, mixed())]
      const [line] = apply(ch, previous, on)
      assert.equal(total(line.bursts), 1250)
      // Switch off: the old deliverable rule for the quantity burst (not changed here).
      assert.deepEqual(
        shape(line.bursts).map(([d, m, q], i) => (i === 1 && !on ? [d, m] : [d, m, q])),
        [["2026-01-12", 750, 0], on ? ["2026-01-19", 500, 2] : ["2026-01-19", 500]],
      )
      // The kept zero burst is the card's own burst, unchanged.
      assert.equal(line.bursts[0], previous[0]!.bursts[0])
    })
  }

  test(`${ch.name}: a quantity typed into the zero burst's week prices as quantity x rate in its place`, () => {
    const previous = [card(ch, mixed())]
    for (const on of [true, false]) {
      const [line] = apply(ch, previous, on, (rows) => {
        // The card's dated bursts open as merged spans; the zero burst's span holds 0.
        const span = rows[0].mergedWeekSpans.find((sp: any) => sp.startYmd === "2026-01-12")
        assert.equal(span.totalQty, 0)
        span.totalQty = 3
      })
      assert.equal(line.bursts.some((b: any) => b === previous[0]!.bursts[0]), false)
      assert.equal(total(line.bursts), 3 * 250 + 500)
    }
  })

  test(`${ch.name}: a zero burst sharing dates with a quantity burst is kept with it`, () => {
    const previous = [card(ch, [burst("$750.00", 19, 25, 0), burst("$500.00", 19, 25, 2)])]
    const [line] = apply(ch, previous, true)
    assert.equal(total(line.bursts), 1250)
  })

  test(`${ch.name}: fixed cost lines are not touched by the zero-burst keep`, () => {
    const previous = [card(ch, mixed(), "fixed_cost")]
    const [line] = apply(ch, previous, true)
    assert.equal(line.bursts.some((b: any) => b === previous[0]!.bursts[0]), false)
  })
}

test("only the seven press and programmatic merges keep zero bursts (OOH unchanged)", () => {
  const previous = [{ buyType: "package", lineItemId: "X1", line_item_id: "X1", bursts: mixed() }]
  const generated = [{ buyType: "package", lineItemId: "X1", line_item_id: "X1", bursts: [{ ...mixed()[1]!, budget: "500" }] }]
  const [ooh] = merge.mergeOohStandardFromExpertWithPrevious(generated as any, previous as any)
  assert.equal(total((ooh as any).bursts), 500)
  const [paper] = merge.mergeNewspaperStandardFromExpertWithPrevious(generated as any, previous as any)
  assert.equal(total((paper as any).bursts), 1250)
})

test("keepZeroQuantityPackageBurstsOnApply: other buy types, $0 generated lines and $0 zero bursts pass through", () => {
  const gen = [{ ...mixed()[1]!, budget: "500" }]
  assert.equal(keepZeroQuantityPackageBurstsOnApply(gen, mixed(), "cpm"), gen)
  assert.equal(keepZeroQuantityPackageBurstsOnApply(gen, mixed(), null), gen)
  const zeroGen = [{ ...mixed()[1]!, budget: "0" }]
  assert.equal(keepZeroQuantityPackageBurstsOnApply(zeroGen, mixed(), "package"), zeroGen)
  const noMoney = [burst("$0.00", 12, 18, 0), burst("$500.00", 19, 25, 2)]
  assert.equal(keepZeroQuantityPackageBurstsOnApply(gen, noMoney, "package"), gen)
  assert.equal(keepZeroQuantityPackageBurstsOnApply(gen, undefined, "Package"), gen)
  // Kept bursts come back in start date order.
  const late = [burst("$500.00", 5, 11, 2), burst("$750.00", 26, 31, 0)]
  const out = keepZeroQuantityPackageBurstsOnApply([{ ...late[0]!, budget: "500" }], late, "package")
  assert.deepEqual(out.map((b) => day(b.startDate)), ["2026-01-05", "2026-01-26"])
})

// L4: the zero-package skip is for package rows only.
function lumpRow(buyType: string) {
  return {
    buyType,
    grossCost: 750,
    unitRate: "",
    weeklyValues: Object.fromEntries(weekKeys.map((k) => [k, ""])) as Record<string, string | number>,
  }
}

test("L4: with keepZeroPackageQty a non-package lump-sum row still gets the card budget projected", () => {
  for (const buyType of ["cpm", "fixed_cost", "spots", "cpc"]) {
    const [row] = projectLumpSumCardBudgetsOntoExpertRows([lumpRow(buyType)] as any[], weekKeys, { keepZeroPackageQty: true })
    assert.equal(Number(row.unitRate), 750, buyType)
    assert.ok(Number(row.weeklyValues[weekKeys[0]!]) > 0, `${buyType} gets a first-week quantity`)
  }
  const [pkg] = projectLumpSumCardBudgetsOntoExpertRows([lumpRow("package")] as any[], weekKeys, { keepZeroPackageQty: true })
  assert.equal(pkg.unitRate, "")
  assert.equal(pkg.weeklyValues[weekKeys[0]!], "")
  // Without the option a package row is projected as before (other grids).
  const [other] = projectLumpSumCardBudgetsOntoExpertRows([lumpRow("package")] as any[], weekKeys)
  assert.equal(Number(other.unitRate), 750)
})
