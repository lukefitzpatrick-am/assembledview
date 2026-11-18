/**
 * B59 (C-277, S9 A): the debtors ledger (Owed) ages invoices to the Melbourne
 * day from the app clock, never the UTC day. `fetchOwedLedger` runs only on
 * the server, so this file runs in UTC with the clock mocked where the UTC
 * day is the day before:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 * The database answers no "today" row (the old fallback path), so a revert
 * to the UTC day shows here.
 */
process.env.TZ = "UTC"

import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const INSTANTS = [
  { at: "2026-11-30T21:00:00Z", day: "2026-12-01", label: "1 Dec 08:00 AEDT" },
  { at: "2026-06-30T21:00:00Z", day: "2026-07-01", label: "1 Jul 07:00 AEST" },
] as const

const execute = mock.fn(async () => [])
if (typeof mock.module === "function") {
  await mock.module("@/db", { namedExports: { db: { execute }, getDb: () => ({ execute }) } })
}

for (const { at, day, label } of INSTANTS) {
  test(`Owed is as of the Melbourne day (${label})`, { skip: mockModuleSkip() }, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(at) })
    const { fetchOwedLedger, normalizeOwedQuery } = await import("@/lib/finance/sections/owedQuery")
    const out = await fetchOwedLedger(normalizeOwedQuery({}))
    assert.equal(out.asOf, day)
  })
}
