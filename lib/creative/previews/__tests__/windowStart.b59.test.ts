/**
 * B59 (C-277, S9 A): the nightly creative preview job asks Snowflake for
 * creatives delivered in the last N days counted back from the Melbourne
 * day, never the UTC day. The job runs only on the server (its cron fires at
 * 17:00 UTC, 03:00 or 04:00 Melbourne, always before 10am), so this file runs
 * in UTC with the clock mocked where the UTC day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 */
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", start: "2026-11-01", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", start: "2026-06-01", label: "1 Jul 07:00 AEST" },
] as const

const binds: unknown[][] = []
const querySnowflake = mock.fn(async (_sql: string, params: unknown[]) => {
  binds.push(params)
  return []
})
if (typeof mock.module === "function") {
  await mock.module("@/lib/snowflake/query", { namedExports: { querySnowflake } })
  await mock.module("@/db", { namedExports: { db: {}, getDb: () => ({}) } })
  await mock.module("@vercel/blob", { namedExports: { put: async () => ({}), del: async () => undefined } })
}

for (const { at, start, label } of INSTANTS) {
  test(`the 30-day window starts 30 Melbourne days back (${label})`, { skip: mockModuleSkip() }, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    binds.length = 0
    const { runCreativePreviewCache } = await import("@/lib/creative/previews/job")
    await runCreativePreviewCache({ days: 30, confirm: false })
    assert.deepEqual(binds, [[start]])
  })
}
