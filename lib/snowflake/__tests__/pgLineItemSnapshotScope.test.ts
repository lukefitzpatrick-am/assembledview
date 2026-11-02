/**
 * Behaviour pin for the snapshot row source (B7 review, finding 7): the
 * default scope runs the tip query (master join + published_version_id
 * where); only `scope: "all"` reads every version. A stub query builder
 * stands in for Drizzle, so swapping the branch fails here even though the
 * source-text pin in pgLineItemSnapshot.test.ts would still pass.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import * as realSchema from "@/db/schema"
import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Row = Record<string, unknown>
const base = {
  createdAt: "2026-10-01T00:00:00.000Z",
  channel: "social",
  platform: "Meta",
  buyType: "CPC",
  bidStrategy: "Lowest",
  fixedCostMedia: false,
  bursts: [{ budget: 10 }],
  publisher: null,
  noAdserving: false,
  clientPaysForMedia: false,
  budgetIncludesFees: false,
  fees: {},
}
const TIP_ROW: Row = { ...base, id: 1, lineItemId: "tip-line", mbaNumber: "golf026" }
const OLD_ROW: Row = { ...base, id: 2, lineItemId: "old-version-line", mbaNumber: "golf026" }

const calls: string[] = []

/** Awaitable like a Drizzle query: `await withFees` is every version, `.innerJoin().where()` is the tip. */
function stubDb() {
  const tipChain = {
    where(_cond: unknown) {
      calls.push("where")
      return Promise.resolve([TIP_ROW])
    },
  }
  const withFees = {
    innerJoin(table: unknown) {
      calls.push(table === realSchema.mediaPlanMasters ? "innerJoin:masters" : "innerJoin:other")
      return tipChain
    },
    then(resolve: (rows: Row[]) => unknown, reject?: (e: unknown) => unknown) {
      calls.push("await:all")
      return Promise.resolve([TIP_ROW, OLD_ROW]).then(resolve, reject)
    },
  }
  const fromChain = {
    innerJoin() {
      return { leftJoin: () => withFees }
    },
  }
  return { select: () => ({ from: () => fromChain }) }
}

if (typeof mock.module === "function") {
  await mock.module("@/db", { namedExports: { getDb: () => stubDb(), schema: realSchema } })
}

const { fetchAllPgLineItems } = await import("../fetchAllPgLineItems")

test("the default scope is the tip query: master join, published_version_id filter, tip rows only", { skip }, async () => {
  calls.length = 0
  const { items, complete } = await fetchAllPgLineItems()
  assert.equal(complete, true)
  assert.deepEqual(items.map((i) => i.line_item_id), ["tip-line"])
  assert.deepEqual(calls, ["innerJoin:masters", "where"])
})

test('scope "tip" is the same as the default', { skip }, async () => {
  calls.length = 0
  const { items } = await fetchAllPgLineItems({ scope: "tip" })
  assert.deepEqual(items.map((i) => i.line_item_id), ["tip-line"])
  assert.deepEqual(calls, ["innerJoin:masters", "where"])
})

test('only scope "all" reads every version', { skip }, async () => {
  calls.length = 0
  const { items } = await fetchAllPgLineItems({ scope: "all" })
  assert.deepEqual(items.map((i) => i.line_item_id), ["tip-line", "old-version-line"])
  assert.deepEqual(calls, ["await:all"])
})
