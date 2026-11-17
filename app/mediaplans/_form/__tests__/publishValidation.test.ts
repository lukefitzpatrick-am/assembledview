/**
 * S1 A (B54): the plan form's publish check. Publish only, empty lines
 * stripped as the server does, a stop only with the switch on.
 */
import "@/lib/testing/melbourneZone"
import assert from "node:assert/strict"
import test from "node:test"

import { PUBLISH_VALIDATION_REFUSED } from "@/lib/mediaplan/publishValidation"

import { NO_PUBLISH_CHECK, publishCheckFromRefusal, publishRefusedToast, publishValidationPreflight } from "../publishValidation"

const dates = { campaignStartDate: "2026-11-01", campaignEndDate: "2026-11-30" }
const blankPublisher = {
  lineItemId: "X1SM1",
  channel: "social",
  platform: "",
  buyType: "cpm",
  bursts: [{ startDate: "2026-11-01", endDate: "2026-11-30", budget: 100, calculatedValue: 10 }],
}
const emptyLine = { lineItemId: "X1SM2", channel: "social", platform: "", buyType: "", bursts: [{ startDate: "2026-11-01", endDate: "2026-12-30", budget: 0 }] }

test("on: a refused publish stops with the 422 body the server sends", () => {
  const { check, stop } = publishValidationPreflight("publish", dates, [blankPublisher], true)
  assert.equal(check.refusing, true)
  assert.deepEqual(check.result.refuse.map((p) => p.rule), ["no_publisher"])
  assert.equal(stop?.code, PUBLISH_VALIDATION_REFUSED)
  assert.deepEqual(stop?.lineItemIds, ["X1SM1"])
})

test("off: the same problems come back for the rail and the publish goes ahead", () => {
  const { check, stop } = publishValidationPreflight("publish", dates, [blankPublisher], false)
  assert.equal(stop, null)
  assert.equal(check.refusing, false)
  assert.equal(check.result.refuse.length, 1)
})

test("draft and new_version saves are not checked; an empty line the server strips never refuses", () => {
  assert.deepEqual(publishValidationPreflight("draft", dates, [blankPublisher], true), { check: NO_PUBLISH_CHECK, stop: null })
  assert.deepEqual(publishValidationPreflight("new_version", dates, [blankPublisher], true).stop, null)
  assert.deepEqual(publishValidationPreflight(null, dates, [blankPublisher], true).stop, null)
  const good = { ...blankPublisher, lineItemId: "X1SM3", platform: "Meta" }
  assert.equal(publishValidationPreflight("publish", dates, [good, emptyLine], true).stop, null)
})

test("the server's refusal lands in the rail as refusing; the toast carries its message", () => {
  const check = publishCheckFromRefusal([{ rule: "package_no_quantity", channel: "ooh", lineItemId: "X1OH1", burst: 1, message: "m" }])
  assert.equal(check.refusing, true)
  assert.equal(check.result.refuse.length, 1)
  assert.deepEqual(publishCheckFromRefusal(undefined).result.refuse, [])
  assert.equal(publishRefusedToast({ error: "Not published." }).description, "Not published.")
  assert.match(publishRefusedToast({}).description, /issues panel/)
})
