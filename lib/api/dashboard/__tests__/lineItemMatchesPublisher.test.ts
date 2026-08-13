/**
 * C-50: Hub spend attribution. Empty/whitespace header1 must not block
 * line_items.publisher; ingest short stamps join via publisher_profiles.publisher_id.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { lineItemMatchesPublisher } from "../lineItemMatchesPublisher"

const QMS = {
  id: 30,
  publisher_name: "QMS",
  publisherid: "QMS",
}

const SCA = {
  id: 12,
  publisher_name: "Southern Cross Austereo",
  publisherid: "sca",
}

const SEN = {
  id: 19,
  publisher_name: "Sports Entertainment Network",
  publisherid: "SEN",
}

const JCDECAUX = {
  id: 35,
  publisher_name: "JCDecaux",
  publisherid: "JCDECAUX",
}

test("C-50: line with header1 = \"\" and publisher = QMS attributes to QMS", () => {
  assert.equal(
    lineItemMatchesPublisher({ header1: "", publisher: "QMS" }, QMS),
    true,
  )
})

test("whitespace header1 falls through to publisher stamp", () => {
  assert.equal(
    lineItemMatchesPublisher({ header1: "   ", publisher: "QMS" }, QMS),
    true,
  )
})

test("ingest short stamp joins SCA/SEN via publisher_profiles.publisher_id, not display name", () => {
  assert.equal(
    lineItemMatchesPublisher({ header1: "", publisher: "SCA" }, SCA),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: "SEN", publisher: "SEN" }, SEN),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: "", publisher: "JCDecaux" }, JCDECAUX),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: "", publisher: "SCA" }, QMS),
    false,
  )
})

test("publisherid on the line is a fallback when header1 and publisher are empty", () => {
  assert.equal(
    lineItemMatchesPublisher({ header1: "", publisher: "", publisherid: "QMS" }, QMS),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: "  ", publisherid: "sca" }, SCA),
    true,
  )
})

test("numeric publisher_id FK on the line matches catalogue id", () => {
  assert.equal(
    lineItemMatchesPublisher({ header1: "", publisher: "", publisher_id: 30 }, QMS),
    true,
  )
  assert.equal(
    lineItemMatchesPublisher({ header1: "Nine", publisher_id: 12 }, SCA),
    true,
  )
})
