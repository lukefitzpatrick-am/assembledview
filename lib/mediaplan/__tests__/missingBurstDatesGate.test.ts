/**
 * AV-D12 — publishing needs a start and end date on every burst.
 * Tests import the helper + schema, not the Auth0 route.
 * Production bursts carry dates, so a blank production burst is refused.
 * Approval "excluded" is not an included line.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import {
  MISSING_BURST_DATES,
  formatMissingBurstDatesMessage,
  missingBurstDatesGateResult,
  shouldRejectMissingBurstDatesOnSave,
} from "@/lib/mediaplan/missingBurstDatesGate"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"

const SOCIAL_ID = "GLENDA009RA2SM1"
const PROD_ID = "GLENDA009RA2PR1"
const LEAD = "Add start and end dates to every burst before publishing."

const CREATE_PAGE = join(process.cwd(), "app/mediaplans/create/page.tsx")
const EDIT_PAGE = join(
  process.cwd(),
  "app/mediaplans/mba/[mba_number]/edit/page.tsx"
)
const SAVE_ROUTE = join(process.cwd(), "app/api/plans/save/route.ts")

function burst(over: Record<string, unknown> = {}) {
  return {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    ...over,
  }
}

function lineItem(over: Record<string, unknown> = {}) {
  return {
    lineItemId: SOCIAL_ID,
    channel: "social",
    buyType: "cpm",
    bursts: [burst()],
    mediaType: "socialMedia",
    rate: 0,
    enteredAmount: 1000,
    ...over,
  }
}

function saveBody(over: Record<string, unknown> = {}) {
  return {
    masterId: 1,
    mbaNumber: "glenda009ra2",
    versionNumber: 1,
    mode: "publish",
    lineItems: [lineItem()],
    feeLoading: {},
    ...over,
  }
}

function publishGate(body: Record<string, unknown>) {
  const parsed = plansSaveBodySchema.safeParse(body)
  assert.equal(parsed.success, true)
  if (!parsed.success) return null
  return missingBurstDatesGateResult(parsed.data.mode, parsed.data.lineItems)
}

describe("publish / draft missing burst dates gate", () => {
  it("publish with a blank start → 422 MISSING_BURST_DATES, id named", () => {
    const gate = publishGate(
      saveBody({
        lineItems: [lineItem({ bursts: [burst({ startDate: "" })] })],
      })
    )
    assert.ok(gate)
    if (!gate) return
    assert.equal(gate.reject, true)
    if (!gate.reject) return
    assert.equal(gate.body.code, MISSING_BURST_DATES)
    assert.deepEqual(gate.body.lineItemIds, [SOCIAL_ID])
    assert.equal(gate.body.error, `${LEAD} ${SOCIAL_ID}`)
  })

  it("publish with a blank end → 422, id named", () => {
    const gate = publishGate(
      saveBody({
        lineItems: [lineItem({ bursts: [burst({ endDate: "  " })] })],
      })
    )
    assert.ok(gate)
    if (!gate || !gate.reject) return
    assert.deepEqual(gate.body.lineItemIds, [SOCIAL_ID])
    assert.match(gate.body.error, new RegExp(SOCIAL_ID))
  })

  it("publish with start after end → 422, id named", () => {
    const gate = publishGate(
      saveBody({
        lineItems: [
          lineItem({
            bursts: [burst({ startDate: "2026-08-01", endDate: "2026-07-01" })],
          }),
        ],
      })
    )
    assert.ok(gate)
    if (!gate || !gate.reject) return
    assert.equal(gate.body.code, MISSING_BURST_DATES)
    assert.deepEqual(gate.body.lineItemIds, [SOCIAL_ID])
  })

  it("draft save with a blank end → accepted", () => {
    const parsed = plansSaveBodySchema.safeParse(
      saveBody({
        mode: "draft",
        lineItems: [lineItem({ bursts: [burst({ endDate: "" })] })],
      })
    )
    assert.equal(parsed.success, true)
    if (!parsed.success) return
    assert.equal(shouldRejectMissingBurstDatesOnSave(parsed.data.mode), false)
    const gate = missingBurstDatesGateResult(parsed.data.mode, parsed.data.lineItems)
    assert.equal(gate.reject, false)
  })

  it("publish with valid dates, including the same day, is accepted", () => {
    const gate = publishGate(
      saveBody({
        lineItems: [
          lineItem({
            bursts: [burst({ startDate: "2026-07-01", endDate: "2026-07-01" })],
          }),
        ],
      })
    )
    assert.ok(gate)
    if (!gate) return
    assert.equal(gate.reject, false)
  })

  it("a production line with a blank end is refused (bursts carry dates)", () => {
    const gate = publishGate(
      saveBody({
        lineItems: [
          lineItem({
            lineItemId: PROD_ID,
            channel: "production",
            buyType: null,
            mediaType: "production",
            bursts: [burst({ endDate: "" })],
          }),
        ],
      })
    )
    assert.ok(gate)
    if (!gate || !gate.reject) return
    assert.deepEqual(gate.body.lineItemIds, [PROD_ID])
  })

  it("an excluded line with a blank end still publishes", () => {
    const gate = publishGate(
      saveBody({
        lineItems: [
          lineItem({
            approval: "excluded",
            bursts: [burst({ endDate: "" })],
          }),
        ],
      })
    )
    assert.ok(gate)
    if (!gate) return
    assert.equal(gate.reject, false)
  })

  it("lists at most five line ids, then and N more", () => {
    const ids = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"]
    assert.equal(
      formatMissingBurstDatesMessage(ids),
      `${LEAD} A1, B2, C3, D4, E5 and 2 more`
    )
  })
})

describe("server publish intent + twin-page 422 wiring", () => {
  it("route decides publish intent after the buy type gate, before savePlanVersion", () => {
    const src = readFileSync(SAVE_ROUTE, "utf8")
    const parseIdx = src.indexOf("plansSaveBodySchema.safeParse")
    const buyTypeIdx = src.indexOf("missingBuyTypeGateResult(body.mode")
    const gateIdx = src.indexOf("missingBurstDatesGateResult(body.mode")
    const saveIdx = src.indexOf("savePlanVersion(")
    assert.ok(parseIdx >= 0, "route must parse plansSaveBodySchema")
    assert.ok(buyTypeIdx > parseIdx, "burst date gate sits beside the buy type gate")
    assert.ok(gateIdx > buyTypeIdx, "burst date gate runs after the buy type gate")
    assert.ok(saveIdx > gateIdx, "burst date gate must run before savePlanVersion")
    assert.match(
      src,
      /missingBurstDatesGateResult\(body\.mode, body\.lineItems\)[\s\S]{0,240}status: 422/
    )
  })

  it("create and edit surface 422 MISSING_BURST_DATES (toast + Issues panel)", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const [label, src] of [
      ["create", createSrc],
      ["edit", editSrc],
    ] as const) {
      assert.match(src, /MISSING_BURST_DATES/, `${label} must handle MISSING_BURST_DATES`)
      assert.match(src, /setMissingBurstDateLineIds/, `${label} must mark Issues panel rows`)
      assert.match(src, /missingBurstDatesBuilderIssues/, `${label} must fold ids into builderIssues`)
    }
  })
})
