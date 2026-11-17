/**
 * B52: the plan form's channel record helpers and builder issues, as
 * behaviour, for both pages. Replaces the twin page source pins for the burst
 * overlap list (B35), and the 422 MISSING_BUY_TYPE and MISSING_BURST_DATES
 * fold into builder issues.
 */
import "@/lib/testing/melbourneZone"
import assert from "node:assert/strict"
import test from "node:test"

import type { BillingBurst } from "@/lib/billing/types"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import type { PanelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

import { buildPlanBuilderIssues, type PlanBuilderIssuesInput } from "../builderIssues"
import { loadedLinesByBillingKey, planBurstOverlapLines, planFeeSeedConfigs, type PlanChannelRecord } from "../planChannels"
import { NO_PUBLISH_CHECK, publishCheckFromRefusal, publishValidationPreflight } from "../publishValidation"

const KEYS = [
  "television", "radio", "newspaper", "magazines", "ooh", "cinema", "digiDisplay", "digiAudio", "digiVideo", "bvod",
  "integration", "production", "search", "socialMedia", "progDisplay", "progVideo", "progBvod", "progAudio", "progOoh", "influencers",
] as const

function record<T>(value: (key: (typeof KEYS)[number]) => T): PlanChannelRecord<T> {
  return Object.fromEntries(KEYS.map((k) => [k, value(k)])) as PlanChannelRecord<T>
}

const overlapping = (id: string) => ({
  line_item_id: id,
  bursts: [
    { startDate: "2026-01-01", endDate: "2026-01-31" },
    { startDate: "2026-01-15", endDate: "2026-02-15" },
  ],
})

test("burst overlap: every channel is read, production last; off reads nothing", () => {
  const lines = planBurstOverlapLines(true, record((k) => [overlapping(`X1${k}`)]))
  assert.equal(lines.length, 20)
  assert.equal(lines.at(-1)!.channel, "production")
  assert.deepEqual(lines.slice(0, 11).map((l) => l.channel), KEYS.slice(0, 11))
  assert.deepEqual(planBurstOverlapLines(false, record((k) => [overlapping(`X1${k}`)])), [])
})

test("fee seed configs: channels on in the form with lines, in billing order, with their bursts", () => {
  const bursts = record((k) => [{ startDate: k } as unknown as BillingBurst])
  const all = planFeeSeedConfigs(record((k) => [{ id: k }]), bursts, () => true)
  assert.deepEqual(all.map((c) => c.billingKey), [...KEYS])
  assert.deepEqual(all[3]!.containerBursts, bursts.magazines)
  const on = new Set(["mp_television", "mp_digidisplay", "mp_production", "mp_progooh"])
  const some = planFeeSeedConfigs(
    record((k) => (k === "progOoh" ? [] : [{ id: k }])),
    bursts,
    (flag) => on.has(flag),
  )
  assert.deepEqual(some.map((c) => c.billingKey), ["television", "digiDisplay", "production"])
})

test("edit loaded lines: each billing key reads its own loaded state (B35 number check, MB-33 reconcile)", () => {
  // Billing key -> the edit page's loaded state (the post-save `initial` writer).
  const expected: Record<(typeof KEYS)[number], string> = {
    television: "televisionLineItems",
    radio: "radioLineItems",
    newspaper: "newspaperLineItems",
    magazines: "magazinesLineItems",
    ooh: "oohLineItems",
    cinema: "cinemaLineItems",
    digiDisplay: "digitalDisplayLineItems",
    digiAudio: "digitalAudioLineItems",
    digiVideo: "digitalVideoLineItems",
    bvod: "bvodLineItems",
    integration: "integrationLineItems",
    production: "productionLineItems",
    search: "searchLineItems",
    socialMedia: "socialMediaLineItems",
    progDisplay: "progDisplayLineItems",
    progVideo: "progVideoLineItems",
    progBvod: "progBvodLineItems",
    progAudio: "progAudioLineItems",
    progOoh: "progOohLineItems",
    influencers: "influencersLineItems",
  }
  // One distinct value per state, so any two keys swapped fail.
  const states = Object.fromEntries(Object.values(expected).map((state) => [state, [state]]))
  const byKey = loadedLinesByBillingKey(states as Parameters<typeof loadedLinesByBillingKey<string[]>>[0])
  assert.deepEqual(Object.keys(byKey).toSorted(), [...KEYS].toSorted())
  for (const key of KEYS) assert.equal(byKey[key], states[expected[key]], key)
})

const financials = {
  validation: { billableEqualsMba: false, deltaExGst: 12.5 },
  mbaFeeAdjusted: false,
} as unknown as CampaignFinancials
const panelIndicators = { mbaDetails: { partialLabel: null } } as unknown as PanelIndicatorsFromCampaignFinancials

const quiet: PlanBuilderIssuesInput = {
  mode: "create",
  clientName: "Golf Co",
  campaignName: "Summer",
  dateWarning: { hasViolation: false, offendingCount: 0 },
  budgetRemainingOverspend: false,
  budgetRemaining: 0,
  finance: null,
  mbaScopeTotals: { adServing: 0, production: 0 },
  missingPublisherKpiCount: 0,
  missingBuyTypeLineIds: [],
  missingBurstDateLineIds: [],
  burstOverlapLines: [],
  publisherGuard: { blocked: [], warnings: [] },
  aaPublishWarnings: [],
  publishCheck: NO_PUBLISH_CHECK,
}

test("nothing to say: no issues", () => {
  assert.deepEqual(buildPlanBuilderIssues(quiet), [])
})

test("rail order, both pages", () => {
  const ids = buildPlanBuilderIssues({
    ...quiet,
    clientName: " ",
    campaignName: null,
    dateWarning: { hasViolation: true, offendingCount: 2 },
    budgetRemainingOverspend: true,
    budgetRemaining: -100,
    finance: { financials, panelIndicators },
    mbaScopeTotals: { adServing: 5, production: 0 },
    missingPublisherKpiCount: 1,
    missingBuyTypeLineIds: ["X1TV1"],
    missingBurstDateLineIds: ["X1RA1"],
    burstOverlapLines: planBurstOverlapLines(true, record((k) => (k === "ooh" ? [overlapping("X1OH1")] : []))),
    aaPublishWarnings: ["AA warning"],
  }).map((i) => i.id)
  assert.deepEqual(ids.slice(0, 5), ["required-client", "required-campaign-name", "dates-outside-window", "budget-overspend", "billable-not-mba"])
  assert.deepEqual(ids.slice(5), [
    "adserving-unvalidated",
    "missing-publisher-kpi",
    "missing-buy-type:X1TV1",
    "missing-burst-dates:X1RA1",
    ids[9],
    "aa-publish-0",
  ])
  assert.match(ids[9]!, /overlap/i)
})

test("ad serving / production: production alone above 0 still asks for a check", () => {
  const ids = (totals: PlanBuilderIssuesInput["mbaScopeTotals"]) =>
    buildPlanBuilderIssues({ ...quiet, mbaScopeTotals: totals }).map((i) => i.id)
  assert.deepEqual(ids({ adServing: 0, production: 250 }), ["adserving-unvalidated"])
  assert.deepEqual(ids({ adServing: 5, production: 0 }), ["adserving-unvalidated"])
  assert.deepEqual(ids({ adServing: 0, production: 0 }), [])
})

test("422 MISSING_BUY_TYPE and MISSING_BURST_DATES ids land in builder issues as errors", () => {
  const issues = buildPlanBuilderIssues({ ...quiet, missingBuyTypeLineIds: ["A"], missingBurstDateLineIds: ["B"] })
  assert.deepEqual(issues.map((i) => [i.id, i.severity]), [
    ["missing-buy-type:A", "error"],
    ["missing-burst-dates:B", "error"],
  ])
})

test("burst overlap is listed once and only as a warning (never a save stop)", () => {
  const overlap = planBurstOverlapLines(true, record((k) => (k === "radio" ? [overlapping("X1RA1")] : [])))
  const issues = buildPlanBuilderIssues({ ...quiet, burstOverlapLines: overlap })
  assert.equal(issues.length, 1)
  assert.equal(issues[0]!.severity, "warning")
})

test("mode: create names the channel cards in the dates detail; edit does not", () => {
  const dates = { hasViolation: true, offendingCount: 1 }
  const create = buildPlanBuilderIssues({ ...quiet, dateWarning: dates })[0]!
  const edit = buildPlanBuilderIssues({ ...quiet, mode: "edit", dateWarning: dates })[0]!
  assert.equal(create.title, "1 line item has flight dates outside the campaign window")
  assert.equal(create.detail, "Open the channel cards and adjust burst dates, or widen campaign dates.")
  assert.equal(edit.detail, "Adjust burst dates or campaign dates.")
})

test("finance issues wait for the page (edit passes none until every channel has loaded)", () => {
  assert.equal(buildPlanBuilderIssues({ ...quiet, finance: null }).length, 0)
  assert.deepEqual(buildPlanBuilderIssues({ ...quiet, finance: { financials, panelIndicators } }).map((i) => i.id), ["billable-not-mba"])
})

test("S1: each publish problem is its own rail entry after the publisher guard; refusals are errors only while refusing", () => {
  const check = (refusing: boolean) =>
    publishValidationPreflight(
      "publish",
      { campaignStartDate: "2026-11-01", campaignEndDate: "2026-11-30" },
      [
        { lineItemId: "X1SM1", channel: "social", platform: "", buyType: "cpm", bursts: [{ startDate: "2026-11-01", endDate: "2026-11-30", budget: 10, calculatedValue: 0 }] },
      ],
      refusing,
    ).check
  const on = buildPlanBuilderIssues({ ...quiet, aaPublishWarnings: ["AA"], publishCheck: check(true) })
  assert.deepEqual(on.map((i) => [i.id, i.severity]), [
    ["publish-validation:no_publisher:social:X1SM1:0:0", "error"],
    ["publish-validation:zero_deliverables:social:X1SM1:1:1", "warning"],
    ["aa-publish-0", "warning"],
  ])
  const off = buildPlanBuilderIssues({ ...quiet, publishCheck: check(false) })
  assert.deepEqual(off.map((i) => i.severity), ["warning", "warning"])
})

test("S1: a line S1 lists for overlapping bursts is not listed again by the B35 warning", () => {
  const overlap = planBurstOverlapLines(true, record((k) => (k === "radio" ? [overlapping("X1RA1"), overlapping("X1RA2")] : [])))
  const publishCheck = publishCheckFromRefusal([
    { rule: "bursts_overlap", channel: "radio", lineItemId: "X1RA1", burst: 2, message: "Line X1RA1: Bursts 1 and 2 overlap." },
  ])
  const ids = buildPlanBuilderIssues({ ...quiet, burstOverlapLines: overlap, publishCheck }).map((i) => i.id)
  assert.equal(ids.filter((id) => id.includes("X1RA1")).length, 1)
  assert.ok(ids.includes("publish-validation:bursts_overlap:radio:X1RA1:2:0"))
  assert.ok(ids.some((id) => id.startsWith("burst-overlap:") && id.includes("X1RA2")))
})
