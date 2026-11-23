/** S5fix (L4a): the live digest loader builds an absolute link from APP_BASE_URL, or none. */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"
import { setFeatureRowReaderForTests } from "@/lib/features/server"

const queries: string[] = []
if (supportsMockModule()) {
  await mock.module!("@/lib/snowflake/query", {
    namedExports: {
      querySnowflake: async (sql: string) => {
        queries.push(sql)
        return []
      },
    },
  })
}

const skip = mockModuleSkip()
const row = (key: string) => ({ key, enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null })

test("APP_BASE_URL set: the link is absolute, trailing slash trimmed; unset: no link", { skip }, async () => {
  setFeatureRowReaderForTests(async () => new Map([["unmapped_delivery", row("unmapped_delivery")], ["unmatched_delivery_queue", row("unmatched_delivery_queue")]]))
  const before = process.env.APP_BASE_URL
  try {
    const { loadDigestUnmatched } = await import("../loadDataChecks.js")
    process.env.APP_BASE_URL = " https://app.example/ "
    const on = await loadDigestUnmatched("2026-11-23")
    assert.equal(on?.status, "ok")
    assert.equal(on?.status === "ok" && on.href, "https://app.example/pacing/admin/relabels?tab=unmapped")
    assert.ok(queries.length > 0, "the queue read ran through querySnowflake")
    delete process.env.APP_BASE_URL
    const unset = await loadDigestUnmatched("2026-11-23")
    assert.equal(unset?.status === "ok" && unset.href, "")
  } finally {
    if (before === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = before
    setFeatureRowReaderForTests(null)
  }
})
