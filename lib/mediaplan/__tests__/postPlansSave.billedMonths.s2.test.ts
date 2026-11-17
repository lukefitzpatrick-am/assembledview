/**
 * S2 A (B56): when a publish changes invoiced months the save route answers
 * 409 BILLED_MONTHS_CHOICE_REQUIRED; postPlansSave asks the plan page's
 * question once and sends the answer with the same body. No answer: the save
 * stops with nothing sent again.
 */
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import type { BilledMonth } from "@/lib/finance/billedMonths/choice"
import { registerBilledMonthsChooser } from "@/lib/mediaplan/billedMonthsChoicePrompt"
import { BILLED_MONTHS_NOT_CHOSEN, postPlansSave, type PlansSaveRequestBody } from "@/lib/mediaplan/buildPostgresSavePayload"

const months: BilledMonth[] = [
  { month: "2026-09", reasons: ["xero_matched"], baseCents: 100000, candidateCents: 80000, deltaCents: -20000, changed: true, lines: [] },
]
const body = { masterId: 1, mbaNumber: "test001", versionNumber: 2, mode: "publish", lineItems: [], feeLoading: {} } as PlansSaveRequestBody

const realFetch = globalThis.fetch
let unregister: (() => void) | null = null
afterEach(() => {
  globalThis.fetch = realFetch
  unregister?.()
  unregister = null
})

function serve(responses: Array<{ status: number; json: unknown }>) {
  const sent: Array<Record<string, unknown>> = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body))
    const r = responses.shift()!
    return new Response(JSON.stringify(r.json), { status: r.status })
  }) as typeof fetch
  return sent
}

const required = { status: 409, json: { code: "BILLED_MONTHS_CHOICE_REQUIRED", error: "choose", billedMonths: months } }
const saved = { status: 200, json: { versionId: 9, lineCount: 0, scheduleRowCount: 0, published: true } }

test("keep: asked once with the months, then the same body goes again with the choice", async () => {
  const asked: BilledMonth[][] = []
  unregister = registerBilledMonthsChooser(async (m) => (asked.push(m), "keep"))
  const sent = serve([required, saved])
  const res = await postPlansSave(body)
  assert.equal(res.ok, true)
  assert.deepEqual(asked, [months])
  assert.equal(sent.length, 2)
  assert.equal(sent[0]!.billedMonthsChoice, undefined)
  assert.deepEqual({ ...sent[1], billedMonthsChoice: undefined }, { ...sent[0], billedMonthsChoice: undefined })
  assert.equal(sent[1]!.billedMonthsChoice, "keep")
})

test("closed without a choice, or no question on the page: the save stops and nothing is sent again", async () => {
  unregister = registerBilledMonthsChooser(async () => null)
  let sent = serve([required])
  let res = await postPlansSave(body)
  assert.equal(res.ok, false)
  assert.equal(res.ok === false && res.data.error, BILLED_MONTHS_NOT_CHOSEN)
  assert.equal(sent.length, 1)

  unregister()
  unregister = null
  sent = serve([required])
  res = await postPlansSave(body)
  assert.equal(res.ok === false && res.status, 409)
  assert.equal(sent.length, 1)
})

test("a refusal after a choice is not asked again", async () => {
  let asked = 0
  unregister = registerBilledMonthsChooser(async () => (asked++, "keep"))
  const sent = serve([required, { status: 409, json: { code: "BILLED_MONTHS_KEEP_FAILED", error: "could not copy" } }])
  const res = await postPlansSave(body)
  assert.equal(res.ok === false && res.data.code, "BILLED_MONTHS_KEEP_FAILED")
  assert.equal(asked, 1)
  assert.equal(sent.length, 2)
})
