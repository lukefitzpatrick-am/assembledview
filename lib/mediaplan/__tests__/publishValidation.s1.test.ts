/**
 * S1 A (B54): the one publish validation set. Table test: each hard rule
 * refuses, each soft rule warns, a clean plan passes.
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import {
  PUBLISH_VALIDATION_REFUSED,
  publishRefusalBody,
  publishValidationBuilderIssues,
  validatePlanForPublish,
  type PublishLine,
  type PublishPlan,
  type PublishRule,
} from "@/lib/mediaplan/publishValidation"

const burst = (startDate: string, endDate: string, over: Record<string, unknown> = {}) => ({
  startDate,
  endDate,
  budget: 1000,
  calculatedValue: 10,
  ...over,
})

const cleanLine = (over: Partial<PublishLine> = {}): PublishLine => ({
  lineItemId: "abc001SM1",
  channel: "social",
  platform: "Meta",
  buyType: "cpm",
  bursts: [burst("2026-11-01", "2026-11-14"), burst("2026-11-15", "2026-11-30")],
  ...over,
})

const plan = (lines: PublishLine[]): PublishPlan => ({
  campaignStartDate: "2026-11-01",
  campaignEndDate: "2026-11-30",
  lineItems: lines,
})

test("a clean plan passes", () => {
  assert.deepEqual(validatePlanForPublish(plan([cleanLine()])), { refuse: [], warn: [] })
})

const cases: Array<{ name: string; line: PublishLine; rule: PublishRule; burst: number | null; kind: "refuse" | "warn" }> = [
  { name: "no publisher (platform channel)", line: cleanLine({ platform: "  " }), rule: "no_publisher", burst: null, kind: "refuse" },
  {
    name: "no publisher (network channel reads attrs.network)",
    line: cleanLine({ lineItemId: "abc001TV1", channel: "television", platform: "Nine", attrs: {} }),
    rule: "no_publisher",
    burst: null,
    kind: "refuse",
  },
  {
    name: "no publisher (production)",
    line: cleanLine({ lineItemId: "abc001PROD1", channel: "production", publisher: "", platform: "Meta" }),
    rule: "no_publisher",
    burst: null,
    kind: "refuse",
  },
  {
    name: "a burst that ends before it starts",
    line: cleanLine({ bursts: [burst("2026-11-01", "2026-11-14"), burst("2026-11-20", "2026-11-18")] }),
    rule: "burst_end_before_start",
    burst: 2,
    kind: "refuse",
  },
  {
    name: "bursts that overlap on one line (shared last day)",
    line: cleanLine({ bursts: [burst("2026-11-01", "2026-11-15"), burst("2026-11-15", "2026-11-30")] }),
    rule: "bursts_overlap",
    burst: 2,
    kind: "refuse",
  },
  {
    name: "a burst outside the plan dates (late end)",
    line: cleanLine({ bursts: [burst("2026-11-01", "2026-12-01")] }),
    rule: "burst_outside_plan_dates",
    burst: 1,
    kind: "refuse",
  },
  {
    name: "a burst outside the plan dates (early start, UTC instant of a Melbourne day)",
    line: cleanLine({ bursts: [burst("2026-10-30T13:00:00.000Z", "2026-11-10")] }),
    rule: "burst_outside_plan_dates",
    burst: 1,
    kind: "refuse",
  },
  {
    name: "a package line with a budget and no quantity",
    line: cleanLine({ buyType: "package", bursts: [burst("2026-11-01", "2026-11-30", { calculatedValue: 0 })] }),
    rule: "package_no_quantity",
    burst: 1,
    kind: "refuse",
  },
  {
    name: "a package line with a blank quantity",
    line: cleanLine({ buyType: "Package", bursts: [burst("2026-11-01", "2026-11-30", { calculatedValue: "" })] }),
    rule: "package_no_quantity",
    burst: 1,
    kind: "refuse",
  },
  {
    name: "a derived line with a budget and no deliverables warns",
    line: cleanLine({ bursts: [burst("2026-11-01", "2026-11-30", { calculatedValue: 0 })] }),
    rule: "zero_deliverables",
    burst: 1,
    kind: "warn",
  },
]

for (const c of cases) {
  test(`${c.kind}: ${c.name}`, () => {
    const result = validatePlanForPublish(plan([c.line]))
    const hit = result[c.kind]
    const other = result[c.kind === "refuse" ? "warn" : "refuse"]
    assert.equal(hit.length, 1, JSON.stringify(result))
    assert.equal(other.length, 0, JSON.stringify(result))
    assert.equal(hit[0]!.rule, c.rule)
    assert.equal(hit[0]!.lineItemId, c.line.lineItemId)
    assert.equal(hit[0]!.channel, c.line.channel)
    assert.equal(hit[0]!.burst, c.burst)
    assert.match(hit[0]!.message, new RegExp(c.line.lineItemId))
  })
}

test("bursts as a JSON string (a stored row) and snake case dates read the same", () => {
  const line = cleanLine({
    bursts: JSON.stringify([
      { start_date: "2026-11-01", end_date: "2026-11-15", budget: 5, calculatedValue: 1 },
      { start_date: "2026-11-10", end_date: "2026-11-20", budget: 5, calculatedValue: 1 },
    ]),
  })
  assert.deepEqual(validatePlanForPublish(plan([line])).refuse.map((p) => p.rule), ["bursts_overlap"])
})

test("left to other checks: a missing burst date, missing plan dates, a $0 package burst", () => {
  const line = cleanLine({
    buyType: "package",
    bursts: [{ startDate: "", endDate: "2026-11-02", budget: 100, calculatedValue: 1 }, burst("2026-11-01", "2026-12-31", { budget: 0, calculatedValue: 0 })],
  })
  assert.deepEqual(validatePlanForPublish({ lineItems: [line] }), { refuse: [], warn: [] })
})

test("the 422 body lists every refused line once; the rail styles refuse and warn apart", () => {
  const refused = validatePlanForPublish(
    plan([
      cleanLine({ platform: "", bursts: [burst("2026-11-01", "2026-12-05")] }),
      cleanLine({ lineItemId: "abc001SM2", bursts: [burst("2026-11-01", "2026-11-30", { calculatedValue: 0 })] }),
    ]),
  )
  const body = publishRefusalBody(refused.refuse)
  assert.equal(body.code, PUBLISH_VALIDATION_REFUSED)
  assert.deepEqual(body.lineItemIds, ["abc001SM1"])
  assert.equal(body.publishProblems.length, 2)
  assert.match(body.error, /abc001SM1 has no publisher/)

  const on = publishValidationBuilderIssues(refused, true)
  assert.deepEqual(on.map((i) => i.severity), ["error", "error", "warning"])
  const off = publishValidationBuilderIssues(refused, false)
  assert.deepEqual(off.map((i) => i.severity), ["warning", "warning", "warning"])
  assert.match(off[0]!.detail!, /once publish validation is on/)
  assert.equal(new Set(on.map((i) => i.id)).size, 3)
})

test("edge: a one-day burst (start equals end) is valid", () => {
  const line = cleanLine({ bursts: [burst("2026-11-10", "2026-11-10"), burst("2026-11-11T13:00:00.000Z", "2026-11-12")] })
  assert.deepEqual(validatePlanForPublish(plan([line])), { refuse: [], warn: [] })
})

test("edge: a one-day plan runs the dates rule (inside passes, a day later is refused)", () => {
  const oneDay = (bursts: unknown): PublishPlan => ({
    campaignStartDate: "2026-11-10",
    campaignEndDate: "2026-11-10",
    lineItems: [cleanLine({ bursts })],
  })
  assert.deepEqual(validatePlanForPublish(oneDay([burst("2026-11-10", "2026-11-10")])), { refuse: [], warn: [] })
  const late = validatePlanForPublish(oneDay([burst("2026-11-11", "2026-11-11")]))
  assert.deepEqual(late.refuse.map((p) => [p.rule, p.burst]), [["burst_outside_plan_dates", 1]])
})

test("a plan that starts after it ends is refused as its own problem, not skipped", () => {
  const reversed: PublishPlan = {
    campaignStartDate: "2026-11-30",
    campaignEndDate: "2026-11-01",
    lineItems: [cleanLine()],
  }
  const result = validatePlanForPublish(reversed)
  assert.deepEqual(result.warn, [])
  assert.deepEqual(result.refuse.map((p) => [p.rule, p.channel, p.lineItemId, p.burst]), [["plan_dates_reversed", "", "", null]])
  assert.match(result.refuse[0]!.message, /plan dates are reversed/)
  const body = publishRefusalBody(result.refuse)
  assert.deepEqual(body.lineItemIds, [])
  assert.match(body.error, /^Not published\. Fix this first: The plan dates are reversed/)
  const [issue] = publishValidationBuilderIssues(result, true)
  assert.equal(issue!.severity, "error")
  assert.equal(issue!.stepLabel, "Campaign setup")
  assert.equal(issue!.fieldLabel, "Campaign dates")
  // The same day at both ends is a one-day plan, not reversed.
  assert.deepEqual(validatePlanForPublish({ ...reversed, campaignEndDate: "2026-11-30", lineItems: [] }).refuse, [])
})

test("a line overlapping on three bursts: one refusal per pair, each with its own rail id", () => {
  const line = cleanLine({
    lineItemId: "abc001RA1",
    channel: "radio",
    attrs: { network: "Nova" },
    bursts: [burst("2026-11-01", "2026-11-20"), burst("2026-11-05", "2026-11-25"), burst("2026-11-10", "2026-11-30")],
  })
  const result = validatePlanForPublish(plan([line]))
  assert.deepEqual(result.refuse.map((p) => [p.rule, p.burst]), [
    ["bursts_overlap", 2],
    ["bursts_overlap", 3],
    ["bursts_overlap", 3],
  ])
  const ids = publishValidationBuilderIssues(result, true).map((i) => i.id)
  assert.equal(new Set(ids).size, 3, ids.join(" "))
})
