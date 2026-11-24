/** S17: with data_quality_queue off the writer and the sweep touch no database. */
import assert from "node:assert/strict"
import { after, test } from "node:test"

import type { Db } from "@/db"

import { setFeatureRowReaderForTests } from "../../features/server.js"
import { recordFindings } from "../items.server.js"
import { runDataQualitySweep } from "../sources.server.js"

let calls = 0
const db = {
  execute: async () => {
    calls += 1
    throw new Error("no database read or write expected")
  },
  transaction: async () => {
    calls += 1
    throw new Error("no transaction expected")
  },
} as unknown as Pick<Db, "execute" | "transaction">

after(() => setFeatureRowReaderForTests(null))

test("off (no switch row, the default): nothing is read or written", async () => {
  setFeatureRowReaderForTests(async () => new Map())
  const finding = {
    ruleKey: "publish.no_publisher" as const,
    mbaNumber: "AAA001",
    lineItemId: "aaa001-1",
    message: "m",
    fixLabel: "Open the plan",
    fixHref: "/mediaplans/mba/AAA001/edit",
  }
  assert.equal(await recordFindings(["publish.no_publisher"], [finding], db), null)
  assert.equal(await runDataQualitySweep([], db), null)
  assert.equal(calls, 0)
})

test("on but the marker missing: still off", async () => {
  setFeatureRowReaderForTests(
    async () => new Map([["data_quality_queue", { key: "data_quality_queue", enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null }]]),
    [],
  )
  assert.equal(await runDataQualitySweep(null, db), null)
  assert.equal(calls, 0)
})
