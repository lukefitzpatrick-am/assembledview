import "@/lib/testing/bothZones"
/**
 * C-342, C-343 and C-344: plan to schedule grid to plan, with no edit, on
 * every channel that has an expert grid (20), every buy type its grid offers
 * that a line is priced on, a round and an awkward budget, Budget Includes
 * Fees on and off, client fee 0 and 12.5%, client pays on and off. Then the
 * same plan with one other row edited. Production (no fee, no buy type) has
 * its own case.
 *
 * The path is the one the containers run: `toExpert` (open the grid),
 * `fromExpert` with the container's fee options, then `mergeFromExpert`
 * (Apply). A grid round trip with no edit should return every burst as it was
 * saved: budget to the cent and of the same type, deliverables and dates.
 *
 * Where it does not today, the case is pinned in `PINNED` (what moves, by how
 * much) and listed as a todo with the numbers. A pinned case that becomes
 * exact, or a new case that moves, fails this file. Fee-inclusive cases at
 * 12.5% are C-342 (the fee share, plus C-343 rounding); every other pinned
 * case is C-343 (a whole-unit deliverable times the rate is not the saved
 * budget). Fixing both empties `PINNED`.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { format } from "date-fns"

import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeLoadedDeliverables } from "@/lib/mediaplan/deliverableBudget"
import * as M from "@/lib/mediaplan/expertChannelMappings"
import {
  BVOD_BUY_TYPE_OPTIONS,
  CINEMA_BUY_TYPE_OPTIONS,
  DIGIAUDIO_BUY_TYPE_OPTIONS,
  DIGITALDISPLAY_BUY_TYPE_OPTIONS,
  DIGIVIDEO_BUY_TYPE_OPTIONS,
  INFLUENCERS_BUY_TYPE_OPTIONS,
  INTEGRATION_BUY_TYPE_OPTIONS,
  MAGAZINES_BUY_TYPE_OPTIONS,
  NEWSPAPER_BUY_TYPE_OPTIONS,
  OOH_BUY_TYPE_OPTIONS,
  PROGAUDIO_BUY_TYPE_OPTIONS,
  PROGBVOD_BUY_TYPE_OPTIONS,
  PROGDISPLAY_BUY_TYPE_OPTIONS,
  PROGOOH_BUY_TYPE_OPTIONS,
  PROGVIDEO_BUY_TYPE_OPTIONS,
  RADIO_BUY_TYPE_OPTIONS,
  SEARCH_BUY_TYPE_OPTIONS,
  SOCIALMEDIA_BUY_TYPE_OPTIONS,
  TV_BUY_TYPE_OPTIONS,
} from "@/lib/mediaplan/expertGridChannelConfig"
import { budgetCellDisplay } from "@/lib/mediaplan/expertGridDayEntry"
import * as S from "@/lib/mediaplan/expertModeSwitch"
import { expertRowCostSplit, expertRowQuantitySum } from "@/lib/mediaplan/expertRowCost"
import { parseBurstMoney } from "@/lib/mediaplan/formatBurstsForPersist"
import { toCents } from "@/lib/money/cents"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

type AnyFn = (...args: any[]) => any

type Channel = {
  name: string
  feeKey: string
  buyTypes: readonly string[]
  toExpert: AnyFn
  fromExpert: AnyFn
  merge: AnyFn
  /** Radio's container passes its fee to the import (deliverable fallback). */
  toExpertFee?: boolean
  /** OOH's container passes only its fee (no Budget Includes Fees fallback). */
  feeOnly?: boolean
}

const values = (opts: ReadonlyArray<{ value: string }>) => opts.map((o) => o.value)

const CHANNELS: Channel[] = [
  { name: "Search", feeKey: "feePctSearch", buyTypes: values(SEARCH_BUY_TYPE_OPTIONS), toExpert: M.mapStandardSearchLineItemsToExpertRows, fromExpert: M.mapSearchExpertRowsToStandardLineItems, merge: S.mergeSearchStandardFromExpertWithPrevious },
  { name: "Social", feeKey: "feePctSocial", buyTypes: values(SOCIALMEDIA_BUY_TYPE_OPTIONS), toExpert: M.mapStandardSocialMediaLineItemsToExpertRows, fromExpert: M.mapSocialMediaExpertRowsToStandardLineItems, merge: S.mergeSocialMediaStandardFromExpertWithPrevious },
  { name: "Influencers", feeKey: "feePctInfluencers", buyTypes: values(INFLUENCERS_BUY_TYPE_OPTIONS), toExpert: M.mapStandardInfluencersLineItemsToExpertRows, fromExpert: M.mapInfluencersExpertRowsToStandardLineItems, merge: S.mergeInfluencersStandardFromExpertWithPrevious },
  { name: "Integration", feeKey: "feePctIntegration", buyTypes: values(INTEGRATION_BUY_TYPE_OPTIONS), toExpert: M.mapStandardIntegrationLineItemsToExpertRows, fromExpert: M.mapIntegrationExpertRowsToStandardLineItems, merge: S.mergeIntegrationStandardFromExpertWithPrevious },
  { name: "Digital Video", feeKey: "feePctDigiVideo", buyTypes: values(DIGIVIDEO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardDigiVideoLineItemsToExpertRows, fromExpert: M.mapDigiVideoExpertRowsToStandardLineItems, merge: S.mergeDigiVideoStandardFromExpertWithPrevious },
  { name: "Digital Display", feeKey: "feePctDigiDisplay", buyTypes: values(DIGITALDISPLAY_BUY_TYPE_OPTIONS), toExpert: M.mapStandardDigiDisplayLineItemsToExpertRows, fromExpert: M.mapDigitalDisplayExpertRowsToStandardLineItems, merge: S.mergeDigiDisplayStandardFromExpertWithPrevious },
  { name: "Digital Audio", feeKey: "feePctDigiAudio", buyTypes: values(DIGIAUDIO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardDigiAudioLineItemsToExpertRows, fromExpert: M.mapDigitalAudioExpertRowsToStandardLineItems, merge: S.mergeDigiAudioStandardFromExpertWithPrevious },
  { name: "BVOD", feeKey: "feePctBvod", buyTypes: values(BVOD_BUY_TYPE_OPTIONS), toExpert: M.mapStandardBvodLineItemsToExpertRows, fromExpert: M.mapBvodExpertRowsToStandardLineItems, merge: S.mergeBvodStandardFromExpertWithPrevious },
  { name: "Prog Display", feeKey: "feePctProgDisplay", buyTypes: values(PROGDISPLAY_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgDisplayLineItemsToExpertRows, fromExpert: M.mapProgDisplayExpertRowsToStandardLineItems, merge: S.mergeProgDisplayStandardFromExpertWithPrevious },
  { name: "Prog Video", feeKey: "feePctProgVideo", buyTypes: values(PROGVIDEO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgVideoLineItemsToExpertRows, fromExpert: M.mapProgVideoExpertRowsToStandardLineItems, merge: S.mergeProgVideoStandardFromExpertWithPrevious },
  { name: "Prog BVOD", feeKey: "feePctProgBvod", buyTypes: values(PROGBVOD_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgBvodLineItemsToExpertRows, fromExpert: M.mapProgBvodExpertRowsToStandardLineItems, merge: S.mergeProgBvodStandardFromExpertWithPrevious },
  { name: "Prog Audio", feeKey: "feePctProgAudio", buyTypes: values(PROGAUDIO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgAudioLineItemsToExpertRows, fromExpert: M.mapProgAudioExpertRowsToStandardLineItems, merge: S.mergeProgAudioStandardFromExpertWithPrevious },
  { name: "Prog OOH", feeKey: "feePctProgOoh", buyTypes: values(PROGOOH_BUY_TYPE_OPTIONS), toExpert: M.mapStandardProgOohLineItemsToExpertRows, fromExpert: M.mapProgOohExpertRowsToStandardLineItems, merge: S.mergeProgOohStandardFromExpertWithPrevious },
  { name: "Newspaper", feeKey: "feePctNewspaper", buyTypes: values(NEWSPAPER_BUY_TYPE_OPTIONS), toExpert: M.mapStandardNewspaperLineItemsToExpertRows, fromExpert: M.mapNewspaperExpertRowsToStandardLineItems, merge: S.mergeNewspaperStandardFromExpertWithPrevious },
  { name: "Magazines", feeKey: "feePctMagazines", buyTypes: values(MAGAZINES_BUY_TYPE_OPTIONS), toExpert: M.mapStandardMagazineLineItemsToExpertRows, fromExpert: M.mapMagazineExpertRowsToStandardLineItems, merge: S.mergeMagazineStandardFromExpertWithPrevious },
  { name: "Cinema", feeKey: "feePctCinema", buyTypes: values(CINEMA_BUY_TYPE_OPTIONS), toExpert: M.mapStandardCinemaLineItemsToExpertRows, fromExpert: M.mapCinemaExpertRowsToStandardLineItems, merge: S.mergeCinemaStandardFromExpertWithPrevious },
  { name: "Radio", feeKey: "feePctRadio", buyTypes: values(RADIO_BUY_TYPE_OPTIONS), toExpert: M.mapStandardRadioLineItemsToExpertRows, fromExpert: M.mapRadioExpertRowsToStandardLineItems, merge: S.mergeRadioStandardFromExpertWithPrevious, toExpertFee: true },
  { name: "Television", feeKey: "feePctTelevision", buyTypes: values(TV_BUY_TYPE_OPTIONS), toExpert: M.mapStandardTvLineItemsToExpertRows, fromExpert: M.mapTvExpertRowsToStandardLineItems, merge: S.mergeTelevisionStandardFromExpertWithPrevious },
  { name: "OOH", feeKey: "feePctOoh", buyTypes: values(OOH_BUY_TYPE_OPTIONS), toExpert: M.mapStandardOohLineItemsToExpertRows, fromExpert: M.mapOohExpertRowsToStandardLineItems, merge: S.mergeOohStandardFromExpertWithPrevious, feeOnly: true },
]

/** Rate and quantity per buy type: a round budget and an awkward one. */
const RATES: Record<string, { round: string; awkward: string }> = {
  cpm: { round: "$15.00", awkward: "$13.00" },
  cpc: { round: "$2.50", awkward: "$2.37" },
  cpv: { round: "$0.05", awkward: "$0.07" },
  spots: { round: "$600.00", awkward: "$650.00" },
  insertions: { round: "$3,000.00", awkward: "$2,950.00" },
  panels: { round: "$1,500.00", awkward: "$1,450.00" },
  cpt: { round: "$40.00", awkward: "$37.00" },
  cpp: { round: "$400.00", awkward: "$390.00" },
}
const BUDGETS = { round: "$12,000.00", awkward: "$7,777.77" } as const

const START = new Date(2026, 2, 1)
const END = new Date(2026, 2, 28)
const COLS = buildWeeklyGanttColumnsFromCampaign(START, END)
/** Saved bursts carry date-only strings, as `mapLineItemFromPostgres` gives them. */
const FLIGHTS = [
  { startDate: "2026-03-01", endDate: "2026-03-07" },
  { startDate: "2026-03-08", endDate: "2026-03-21" },
]

type Variant = { incl: boolean; fee: number; clientPays: boolean }
const VARIANTS: Variant[] = []
for (const incl of [false, true]) {
  for (const fee of [0, 12.5]) {
    for (const clientPays of [false, true]) VARIANTS.push({ incl, fee, clientPays })
  }
}
const variantName = (v: Variant) =>
  `${v.incl ? "fee-inclusive" : "fee on top"}, fee ${v.fee}%${v.clientPays ? ", client pays" : ""}`

function savedBurst(buyType: string, size: "round" | "awkward", v: Variant, flight: (typeof FLIGHTS)[number]) {
  const bt = buyType.toLowerCase()
  if (bt === "bonus") return { budget: "0", buyAmount: "0", calculatedValue: 5000, ...flight }
  if (bt === "package_inclusions") return { budget: "0", buyAmount: "0", calculatedValue: 1, ...flight }
  if (bt === "fixed_cost") return { budget: BUDGETS[size], buyAmount: BUDGETS[size], calculatedValue: 1, ...flight }
  if (bt === "package") return { budget: "$12,000.00", buyAmount: "$1,500.00", calculatedValue: 8, ...flight }
  const rate = RATES[bt]?.[size] ?? "$10.00"
  const burst = { budget: BUDGETS[size], buyAmount: rate }
  return { ...burst, calculatedValue: computeLoadedDeliverables(bt, burst, v.incl, v.fee), ...flight }
}

/** Buy types with a rate the line is priced on (not bid strategies, which never reach a line). */
const LINE_BUY_TYPES = new Set(["bonus", "package_inclusions", "fixed_cost", "package", ...Object.keys(RATES)])

function savedPlan(ch: Channel, v: Variant) {
  const lines: any[] = []
  for (const buyType of ch.buyTypes.filter((b) => LINE_BUY_TYPES.has(b))) {
    for (const size of ["round", "awkward"] as const) {
      if (size === "awkward" && (buyType === "bonus" || buyType === "package_inclusions" || buyType === "package")) continue
      const id = `c342${ch.name.replace(/\s/g, "")}${lines.length + 1}`
      lines.push({
        buyType,
        budgetIncludesFees: v.incl,
        clientPaysForMedia: v.clientPays,
        fixedCostMedia: false,
        noadserving: false,
        line_item_id: id,
        lineItemId: id,
        line_item: lines.length + 1,
        lineItem: lines.length + 1,
        bursts: FLIGHTS.map((f) => savedBurst(buyType, size, v, f)),
        _label: `${buyType} ${size}`,
      })
    }
  }
  return lines
}

/**
 * C-344: OOH carries each imported burst's saved budget on its merged span
 * (`gross`) and Apply writes that budget back whatever the planner typed,
 * so a rate or quantity edit on an imported span never reaches the budget.
 */
const EDIT_IGNORED = new Set(["OOH"])

/** Today's moves, per case. Empty when C-342 and C-343 are fixed. */
const PINNED: Record<string, string> = {
  "Search | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Search | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Search | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Search | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Search | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Search | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Search | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Search | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Social | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Social | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Social | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Social | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Social | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Social | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Social | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Social | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Influencers | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Influencers | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Influencers | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Influencers | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Influencers | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Influencers | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Influencers | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Influencers | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Integration | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Integration | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Integration | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Integration | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Integration | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Integration | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Integration | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Integration | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Digital Video | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Digital Video | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Video | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Digital Video | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Video | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Digital Video | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Video | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Digital Video | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Digital Display | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Digital Display | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Display | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Digital Display | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Display | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Digital Display | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Display | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Digital Display | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Digital Audio | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Digital Audio | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Audio | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Digital Audio | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Audio | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Digital Audio | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Digital Audio | fee-inclusive, fee 12.5%": "10 budgets +908186c, 0 deliverables",
  "Digital Audio | fee-inclusive, fee 12.5%, client pays": "10 budgets +908186c, 0 deliverables",
  "BVOD | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "BVOD | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "BVOD | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "BVOD | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "BVOD | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "BVOD | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "BVOD | fee-inclusive, fee 12.5%": "10 budgets +908186c, 0 deliverables",
  "BVOD | fee-inclusive, fee 12.5%, client pays": "10 budgets +908186c, 0 deliverables",
  "Prog Display | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog Display | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Display | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Prog Display | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Display | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog Display | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Display | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Prog Display | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Prog Video | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog Video | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Video | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Prog Video | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Video | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog Video | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Video | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Prog Video | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Prog BVOD | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog BVOD | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog BVOD | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Prog BVOD | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog BVOD | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog BVOD | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog BVOD | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Prog BVOD | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Prog Audio | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog Audio | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Audio | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Prog Audio | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Audio | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog Audio | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog Audio | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Prog Audio | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Prog OOH | fee on top, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog OOH | fee on top, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog OOH | fee on top, fee 12.5%": "2 budgets +114c, 0 deliverables",
  "Prog OOH | fee on top, fee 12.5%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog OOH | fee-inclusive, fee 0%": "2 budgets +114c, 0 deliverables",
  "Prog OOH | fee-inclusive, fee 0%, client pays": "2 budgets +114c, 0 deliverables",
  "Prog OOH | fee-inclusive, fee 12.5%": "12 budgets -1483116c, 12 deliverables",
  "Prog OOH | fee-inclusive, fee 12.5%, client pays": "12 budgets -1483116c, 12 deliverables",
  "Newspaper | fee on top, fee 0%": "2 budgets +214446c, 0 deliverables",
  "Newspaper | fee on top, fee 0%, client pays": "2 budgets +214446c, 0 deliverables",
  "Newspaper | fee on top, fee 12.5%": "2 budgets +214446c, 0 deliverables",
  "Newspaper | fee on top, fee 12.5%, client pays": "2 budgets +214446c, 0 deliverables",
  "Newspaper | fee-inclusive, fee 0%": "2 budgets +214446c, 0 deliverables",
  "Newspaper | fee-inclusive, fee 0%, client pays": "2 budgets +214446c, 0 deliverables",
  "Newspaper | fee-inclusive, fee 12.5%": "6 budgets -869998c, 8 deliverables",
  "Newspaper | fee-inclusive, fee 12.5%, client pays": "6 budgets -869998c, 8 deliverables",
  "Magazines | fee on top, fee 0%": "2 budgets +214446c, 0 deliverables",
  "Magazines | fee on top, fee 0%, client pays": "2 budgets +214446c, 0 deliverables",
  "Magazines | fee on top, fee 12.5%": "2 budgets +214446c, 0 deliverables",
  "Magazines | fee on top, fee 12.5%, client pays": "2 budgets +214446c, 0 deliverables",
  "Magazines | fee-inclusive, fee 0%": "2 budgets +214446c, 0 deliverables",
  "Magazines | fee-inclusive, fee 0%, client pays": "2 budgets +214446c, 0 deliverables",
  "Magazines | fee-inclusive, fee 12.5%": "6 budgets -869998c, 8 deliverables",
  "Magazines | fee-inclusive, fee 12.5%, client pays": "6 budgets -869998c, 8 deliverables",
  "Cinema | fee on top, fee 0%": "2 budgets +4446c, 0 deliverables",
  "Cinema | fee on top, fee 0%, client pays": "2 budgets +4446c, 0 deliverables",
  "Cinema | fee on top, fee 12.5%": "2 budgets +4446c, 0 deliverables",
  "Cinema | fee on top, fee 12.5%, client pays": "2 budgets +4446c, 0 deliverables",
  "Cinema | fee-inclusive, fee 0%": "2 budgets +4446c, 0 deliverables",
  "Cinema | fee-inclusive, fee 0%, client pays": "2 budgets +4446c, 0 deliverables",
  "Cinema | fee-inclusive, fee 12.5%": "10 budgets +906670c, 0 deliverables",
  "Cinema | fee-inclusive, fee 12.5%, client pays": "10 budgets +906670c, 0 deliverables",
  "Radio | fee on top, fee 0%": "2 budgets +4446c, 0 deliverables",
  "Radio | fee on top, fee 0%, client pays": "2 budgets +4446c, 0 deliverables",
  "Radio | fee on top, fee 12.5%": "2 budgets +4446c, 0 deliverables",
  "Radio | fee on top, fee 12.5%, client pays": "2 budgets +4446c, 0 deliverables",
  "Radio | fee-inclusive, fee 0%": "2 budgets +4446c, 0 deliverables",
  "Radio | fee-inclusive, fee 0%, client pays": "2 budgets +4446c, 0 deliverables",
  "Radio | fee-inclusive, fee 12.5%": "10 budgets +906670c, 0 deliverables",
  "Radio | fee-inclusive, fee 12.5%, client pays": "10 budgets +906670c, 0 deliverables",
  "Television | fee on top, fee 0%": "6 budgets +7338c, 0 deliverables",
  "Television | fee on top, fee 0%, client pays": "6 budgets +7338c, 0 deliverables",
  "Television | fee on top, fee 12.5%": "6 budgets +7338c, 0 deliverables",
  "Television | fee on top, fee 12.5%, client pays": "6 budgets +7338c, 0 deliverables",
  "Television | fee-inclusive, fee 0%": "6 budgets +7338c, 0 deliverables",
  "Television | fee-inclusive, fee 0%, client pays": "6 budgets +7338c, 0 deliverables",
  "Television | fee-inclusive, fee 12.5%": "18 budgets +848818c, 0 deliverables",
  "Television | fee-inclusive, fee 12.5%, client pays": "18 budgets +848818c, 0 deliverables",
}

function applyNoEdit(ch: Channel, v: Variant, saved: any[], edit?: (rows: any[]) => void) {
  const rows = ch.toExpert(saved, COLS, START, END, ...(ch.toExpertFee ? [{ feePct: v.fee }] : []))
  edit?.(rows)
  const opts: Record<string, unknown> = ch.feeOnly
    ? { [ch.feeKey]: v.fee }
    : { [ch.feeKey]: v.fee, budgetIncludesFees: Boolean(saved[0]?.budgetIncludesFees) }
  const generated = ch.fromExpert(rows, COLS, START, END, opts)
  return ch.merge(generated, saved) as any[]
}


/** A fixed cost line on fee on top, the row a planner edits in the "one other row edited" run. */
function withEditTarget(lines: any[], ch: Channel) {
  const id = `c342${ch.name.replace(/\s/g, "")}Edit`
  return [
    ...lines,
    {
      buyType: "fixed_cost",
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      fixedCostMedia: false,
      noadserving: false,
      line_item_id: id,
      lineItemId: id,
      line_item: lines.length + 1,
      lineItem: lines.length + 1,
      bursts: [{ budget: "$1,000.00", buyAmount: "$1,000.00", calculatedValue: 1, ...FLIGHTS[0]! }],
      _label: "edit target",
    },
  ]
}

/** The civil day a burst date names: a date-only string as is, a Date by its local Y/M/D (as `burstDate` says to read one). */
const day = (d: unknown) =>
  d instanceof Date ? format(d, "yyyy-MM-dd") : formatBurstDateLocal(String(d ?? ""))
const byStart = (bursts: any[]) => [...bursts].sort((a, b) => day(a.startDate).localeCompare(day(b.startDate)))

type Burst = { budget: string; budgetType: string; cents: number; deliverables: number; dates: string }

/** Each line's bursts in date order (Apply may reorder them; order carries no money). */
function readLines(lines: any[]): Map<string, { label: string; buyType: string; bursts: Burst[] }> {
  const out = new Map<string, { label: string; buyType: string; bursts: Burst[] }>()
  for (const l of lines) {
    out.set(String(l.line_item_id ?? l.lineItemId), {
      label: l._label ?? "",
      buyType: String(l.buyType ?? ""),
      bursts: byStart(l.bursts ?? []).map((b) => ({
        budget: String(b.budget),
        budgetType: typeof b.budget,
        cents: toCents(parseBurstMoney(b.budget)),
        deliverables: Number(b.calculatedValue),
        dates: `${day(b.startDate)}..${day(b.endDate)}`,
      })),
    })
  }
  return out
}

type Moves = { budgets: number; centsDelta: number; deliverables: number; other: number; sample: string[] }

/**
 * What moved between the saved plan and the plan after Apply. A package
 * line's deliverable is left out: with `expert_package_quantity` off it is
 * 0 (digital grids) or 1 (press) by rule (B10, C-168), not by this bug.
 */
function movesBetween(saved: any[], applied: any[], skipId?: string): Moves {
  const was = readLines(saved)
  const now = readLines(applied)
  const m: Moves = { budgets: 0, centsDelta: 0, deliverables: 0, other: 0, sample: [] }
  for (const [id, line] of was) {
    if (id === skipId) continue
    const after = now.get(id)
    if (!after || after.bursts.length !== line.bursts.length) {
      m.other += 1
      m.sample.push(`${line.label}: ${line.bursts.length} bursts -> ${after?.bursts.length ?? 0}`)
      continue
    }
    line.bursts.forEach((b, i) => {
      const a = after.bursts[i]!
      if (a.cents !== b.cents || a.budgetType !== b.budgetType) {
        m.budgets += 1
        m.centsDelta += a.cents - b.cents
        if (m.sample.length < 4) m.sample.push(`${line.label} ${b.dates}: ${b.budget} -> ${a.budget}`)
      }
      if (line.buyType !== "package" && !(Math.abs(a.deliverables - b.deliverables) < 1e-6)) {
        m.deliverables += 1
        if (m.sample.length < 4) m.sample.push(`${line.label} ${b.dates}: deliverables ${b.deliverables} -> ${a.deliverables}`)
      }
      if (a.dates !== b.dates) {
        m.other += 1
        m.sample.push(`${line.label}: dates ${b.dates} -> ${a.dates}`)
      }
    })
  }
  return m
}

const summary = (m: Moves) => `${m.budgets} budgets ${m.centsDelta >= 0 ? "+" : ""}${m.centsDelta}c, ${m.deliverables} deliverables`

/** Production has no fee and no buy type: cost x amount, the 20th grid. */
test("Production: no edit returns every burst as saved", () => {
  const saved: any[] = [
    {
      mediaType: "Production",
      publisher: "Studio",
      description: "Edit",
      market: "National",
      unitRate: 1234.56,
      line_item_id: "c342Production1",
      lineItemId: "c342Production1",
      line_item: 1,
      lineItem: 1,
      bursts: FLIGHTS.map((f) => ({ cost: 1234.56, amount: 3, budget: "$3,703.68", buyAmount: "3", calculatedValue: 3, ...f })),
      _label: "production",
    },
  ]
  const rows = M.mapStandardProductionLineItemsToExpertRows(saved, COLS, START, END)
  const applied = S.mergeProductionStandardFromExpertWithPrevious(
    M.mapProductionExpertRowsToStandardLineItems(rows, COLS, START, END),
    saved
  )
  const moves = movesBetween(saved, applied)
  // Pinned (C-343): the two-week burst comes back as one burst a week, its
  // amount split 2 and 1. The line's money is unchanged.
  assert.deepEqual(moves.sample, ["production: 2 bursts -> 3"])
  const total = (lines: any[]) => lines[0].bursts.reduce((c: number, b: any) => c + toCents(parseBurstMoney(b.budget)), 0)
  assert.equal(total(applied), total(saved))
})
test.todo("Production: a multi-week burst should come back as one burst (C-343)")

/**
 * What the grid shows for a fee-inclusive line today (the rule question in
 * C-342). One cpm line, $12,000.00 a week for one week, CPM $15.00, fee 12.5%,
 * saved deliverables 700,000 (the net $10,500.00 buys them). Every channel
 * imports the saved deliverables, so the grid's quantity is the net's, its
 * $ Budget cell is quantity x rate (the net), and its Net Media column and
 * footer take the fee off that again.
 */
for (const name of ["Search", "BVOD"]) {
  test(`${name}: the grid shows a fee-inclusive $12,000.00 line as $10,500.00 (C-342)`, () => {
    const ch = CHANNELS.find((c) => c.name === name)!
    const v: Variant = { incl: true, fee: 12.5, clientPays: false }
    const line = { ...savedPlan(ch, v).find((l) => l._label === "cpm round")!, bursts: [savedBurst("cpm", "round", v, FLIGHTS[0]!)] }
    const [row] = ch.toExpert([line], COLS, START, END)
    const weekKeys = COLS.map((c) => c.weekKey)
    assert.equal(expertRowQuantitySum(row, weekKeys), 700_000)
    assert.equal(budgetCellDisplay(row.buyType, Number(row.unitRate), expertRowQuantitySum(row, weekKeys)), (10500).toLocaleString())
    const split = expertRowCostSplit(row, weekKeys, 12.5)
    assert.deepEqual(
      { raw: split.raw, net: split.net, fee: split.fee },
      { raw: 10_500, net: 9_187.5, fee: 1_312.5 },
      "quantity x rate is read as the gross: Net Media $9,187.50, Total w/ fees $10,500.00"
    )
  })
}

const DUMP_FILE = process.env.C342_DUMP_FILE
const dump: Record<string, string> = {}

for (const ch of CHANNELS) {
  for (const v of VARIANTS) {
    const key = `${ch.name} | ${variantName(v)}`
    const saved = withEditTarget(savedPlan(ch, v), ch)
    const editId = saved[saved.length - 1]!.line_item_id as string
    const noEdit = applyNoEdit(ch, v, saved)
    const moves = movesBetween(saved, noEdit)
    if (moves.budgets + moves.deliverables + moves.other > 0) dump[key] = summary(moves)

    test(`${key}: no edit returns every burst as saved, or the known C-342 / C-343 move`, () => {
      assert.equal(moves.other, 0, moves.sample.join("; "))
      assert.equal(summary(moves), PINNED[key] ?? summary({ budgets: 0, centsDelta: 0, deliverables: 0, other: 0, sample: [] }), moves.sample.join("; "))
    })
    if (PINNED[key]) test.todo(`${key}: should return as saved; today ${PINNED[key]} (${moves.sample.slice(0, 2).join("; ")})`)

    test(`${key}: editing one other row changes nothing on the rest`, () => {
      const edited = applyNoEdit(ch, v, saved, (rows) => {
        const row = rows.find((r: any) => r.sourceLineItemId === editId)
        row.unitRate = 2000
      })
      const rest = movesBetween(noEdit, edited, editId)
      assert.equal(rest.budgets + rest.deliverables + rest.other, 0, rest.sample.join("; "))
      const target = readLines(edited).get(editId)!
      if (EDIT_IGNORED.has(ch.name)) {
        assert.equal(target.bursts[0]!.cents, 100_000, "C-344 pinned: the span keeps its saved budget")
      } else {
        assert.notEqual(target.bursts[0]!.cents, 100_000, "the edited row's new rate reaches its budget")
      }
    })
    if (EDIT_IGNORED.has(ch.name)) {
      test.todo(`${key}: C-344, a rate edit on an imported span should reach its budget; today it keeps $1,000.00`)
    }
  }
}

if (DUMP_FILE) {
  test("dump", async () => {
    const fs = await import("node:fs")
    fs.writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 1))
  })
}
