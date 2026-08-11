import assert from "node:assert/strict"
import test from "node:test"
import { parseMbaNumberFromLineItemId } from "../lineItemIds"

test("parseMbaNumberFromLineItemId: compact buildLineItemId shape", () => {
  assert.equal(parseMbaNumberFromLineItemId("BICAU002SM1"), "BICAU002")
  assert.equal(parseMbaNumberFromLineItemId("hema001SE12"), "hema001")
  assert.equal(parseMbaNumberFromLineItemId("PENFOLD016PROD3"), "PENFOLD016")
  assert.equal(parseMbaNumberFromLineItemId("golf025OH68"), "golf025")
})

test("parseMbaNumberFromLineItemId: legacy ML media code", () => {
  assert.equal(parseMbaNumberFromLineItemId("PENFOLD001ML7"), "PENFOLD001")
})

test("parseMbaNumberFromLineItemId: pipe-delimited pacing id", () => {
  assert.equal(parseMbaNumberFromLineItemId("hema001|1|se|probe"), "hema001")
  assert.equal(parseMbaNumberFromLineItemId("BICAU002|2|sm|x"), "BICAU002")
})

test("parseMbaNumberFromLineItemId: blank / unparseable → null", () => {
  assert.equal(parseMbaNumberFromLineItemId(""), null)
  assert.equal(parseMbaNumberFromLineItemId("   "), null)
  assert.equal(parseMbaNumberFromLineItemId("nomediatype"), null)
})
