/**
 * FB-6: expert grid Apply keeps the grid's "No Ad Serving" value for existing lines
 * on every channel whose grid shows that column (BVOD, Digital Video, Digital Display,
 * Digital Audio; the programmatic channels already did). Channels with no column keep
 * the previous standard value (see tests/lib/expertModeSwitch.test.ts).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"
import {
  mapStandardBvodLineItemsToExpertRows,
  mapBvodExpertRowsToStandardLineItems,
  mapStandardDigiVideoLineItemsToExpertRows,
  mapDigiVideoExpertRowsToStandardLineItems,
  mapStandardDigiDisplayLineItemsToExpertRows,
  mapDigitalDisplayExpertRowsToStandardLineItems,
  mapStandardDigiAudioLineItemsToExpertRows,
  mapDigitalAudioExpertRowsToStandardLineItems,
} from "@/lib/mediaplan/expertChannelMappings"
import {
  mergeBvodStandardFromExpertWithPrevious,
  mergeDigiVideoStandardFromExpertWithPrevious,
  mergeDigiDisplayStandardFromExpertWithPrevious,
  mergeDigiAudioStandardFromExpertWithPrevious,
  mergeOohStandardFromExpertWithPrevious,
  serializeDigiDisplayExpertRowsBaseline,
} from "@/lib/mediaplan/expertModeSwitch"
import {
  createEmptyBvodExpertRow,
  createEmptyDigitalAudioExpertRow,
  createEmptyDigitalDisplayExpertRow,
} from "@/lib/mediaplan/expertGridChannelConfig"
import { DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG, BVOD_EXPERT_CHANNEL_CONFIG, DIGIAUDIO_EXPERT_CHANNEL_CONFIG, DIGIVIDEO_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"

const CS = new Date(2026, 0, 4)
const CE = new Date(2026, 0, 31)
const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)

function stdLine(id: string, noadserving: boolean): any {
  return {
    platform: "P",
    site: "S",
    publisher: "Pub",
    bidStrategy: "",
    buyType: "cpm",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    noadserving,
    placement: "",
    size: "",
    targetingAttribute: "",
    lineItemId: id,
    line_item_id: id,
    line_item: 1,
    lineItem: 1,
    bursts: [
      {
        budget: "1000",
        buyAmount: "10",
        startDate: new Date(2026, 0, 11),
        endDate: new Date(2026, 0, 17),
        calculatedValue: 100000,
      },
    ],
  }
}

type Channel = {
  name: string
  toExpert: (items: any[], c: any, s: Date, e: Date) => any[]
  toStandard: (rows: any[], c: any, s: Date, e: Date, o?: any) => any[]
  merge: (gen: any[], prev: any[]) => any[]
  config: { billingFlagKeys: readonly string[] }
}

const CHANNELS: Channel[] = [
  { name: "BVOD", toExpert: mapStandardBvodLineItemsToExpertRows as any, toStandard: mapBvodExpertRowsToStandardLineItems as any, merge: mergeBvodStandardFromExpertWithPrevious as any, config: BVOD_EXPERT_CHANNEL_CONFIG },
  { name: "Digital Video", toExpert: mapStandardDigiVideoLineItemsToExpertRows as any, toStandard: mapDigiVideoExpertRowsToStandardLineItems as any, merge: mergeDigiVideoStandardFromExpertWithPrevious as any, config: DIGIVIDEO_EXPERT_CHANNEL_CONFIG },
  { name: "Digital Display", toExpert: mapStandardDigiDisplayLineItemsToExpertRows as any, toStandard: mapDigitalDisplayExpertRowsToStandardLineItems as any, merge: mergeDigiDisplayStandardFromExpertWithPrevious as any, config: DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG },
  { name: "Digital Audio", toExpert: mapStandardDigiAudioLineItemsToExpertRows as any, toStandard: mapDigitalAudioExpertRowsToStandardLineItems as any, merge: mergeDigiAudioStandardFromExpertWithPrevious as any, config: DIGIAUDIO_EXPERT_CHANNEL_CONFIG },
]

for (const ch of CHANNELS) {
  test(`${ch.name}: grid shows a No Ad Serving column`, () => {
    assert.ok(ch.config.billingFlagKeys.includes("noadserving"))
  })

  test(`${ch.name}: standard No Ad Serving seeds the expert row and survives an untouched Apply`, () => {
    const prev = [stdLine("li-1", true)]
    const rows = ch.toExpert(prev, cols, CS, CE)
    assert.equal(rows[0]!.noadserving, true)
    const gen = ch.toStandard(rows, cols, CS, CE, {})
    const merged = ch.merge(gen, prev)
    assert.equal(merged[0]!.noadserving, true)
    assert.equal(merged[0]!.line_item_id, "li-1")
  })

  test(`${ch.name}: grid value wins over the previous standard value on Apply`, () => {
    const prevOn = [stdLine("li-1", true)]
    const rowsOff = ch.toExpert(prevOn, cols, CS, CE).map((r) => ({ ...r, noadserving: false }))
    assert.equal(ch.merge(ch.toStandard(rowsOff, cols, CS, CE, {}), prevOn)[0]!.noadserving, false)

    const prevOff = [stdLine("li-1", false)]
    const rowsOn = ch.toExpert(prevOff, cols, CS, CE).map((r) => ({ ...r, noadserving: true }))
    assert.equal(ch.merge(ch.toStandard(rowsOn, cols, CS, CE, {}), prevOff)[0]!.noadserving, true)
  })
}

test("empty expert rows default No Ad Serving to false", () => {
  const keys = cols.map((c) => c.weekKey)
  assert.equal(createEmptyDigitalDisplayExpertRow("a", CS, CE, keys).noadserving, false)
  assert.equal(createEmptyDigitalAudioExpertRow("a", CS, CE, keys).noadserving, false)
  assert.equal(createEmptyBvodExpertRow("a", CS, CE, keys).noadserving, false)
})

test("a No Ad Serving flag-only edit makes the expert grid dirty", () => {
  const rows = mapStandardDigiDisplayLineItemsToExpertRows([stdLine("li-1", false)], cols, CS, CE)
  const before = serializeDigiDisplayExpertRowsBaseline(rows)
  const after = serializeDigiDisplayExpertRowsBaseline(rows.map((r) => ({ ...r, noadserving: true })))
  assert.notEqual(before, after)
})

test("OOH has no No Ad Serving grid column, so Apply keeps the previous value", () => {
  const gen: any[] = [{ ...stdLine("o-1", false), network: "N", format: "", type: "", noAdserving: false }]
  const prev: any[] = [{ ...gen[0], noAdserving: true }]
  assert.equal(mergeOohStandardFromExpertWithPrevious(gen, prev)[0]!.noAdserving, true)
})
