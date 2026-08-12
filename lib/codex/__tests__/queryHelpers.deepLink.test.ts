import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseMbaNumbersQuery,
  parseTasksDeepLinkParams,
} from "../queryHelpers.js"

test("parseTasksDeepLinkParams round-trips mba + client", () => {
  const params = new URLSearchParams()
  params.set("mba", "KRUSTY001")
  params.set("client", "12")
  assert.deepEqual(parseTasksDeepLinkParams(params), {
    mbaNumber: "KRUSTY001",
    clientId: "12",
  })
})

test("parseMbaNumbersQuery preserves order and uniqueness", () => {
  assert.deepEqual(parseMbaNumbersQuery("Z,A,Z,B"), ["Z", "A", "B"])
})
