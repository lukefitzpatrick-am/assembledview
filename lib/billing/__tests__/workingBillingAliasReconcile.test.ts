/**
 * MB-30 (B20): alias reconcile telemetry. One row per line with its months,
 * sent once per distinct report per session, never on an empty report.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  WORKING_BILLING_ALIAS_RECONCILE_KIND,
  reportWorkingBillingAliasReconcile,
  resetAliasReconcileSentForTests,
  summariseAliasReconcileEntries,
} from "@/lib/billing/workingBillingAliasReconcile"
import type { BillingAliasReconcileEntry } from "@/lib/billing/appendAutoReferenceIntoWorking"

const entries: BillingAliasReconcileEntry[] = [
  { kind: "alias_adoption", mediaKey: "ooh", monthYear: "June 2026", fromId: "malay003ML2", toId: "malay003OH2" },
  { kind: "alias_adoption", mediaKey: "ooh", monthYear: "May 2026", fromId: "malay003ML1", toId: "malay003OH1" },
  { kind: "alias_adoption", mediaKey: "ooh", monthYear: "June 2026", fromId: "malay003ML1", toId: "malay003OH1" },
  { kind: "placeholder_skip", mediaKey: "progBvod", monthYear: "May 2026", id: "billing-progBvod::new-0" },
  { kind: "placeholder_skip", mediaKey: "progBvod", monthYear: "May 2026", id: "billing-progBvod::new-0" },
]

test("summary: one row per line, months sorted and unique", () => {
  assert.deepEqual(summariseAliasReconcileEntries(entries), {
    aliasAdoptions: [
      { mediaKey: "ooh", fromId: "malay003ML1", toId: "malay003OH1", months: ["June 2026", "May 2026"] },
      { mediaKey: "ooh", fromId: "malay003ML2", toId: "malay003OH2", months: ["June 2026"] },
    ],
    placeholderSkips: [{ mediaKey: "progBvod", id: "billing-progBvod::new-0", months: ["May 2026"] }],
  })
})

test("report: posts the new kind once per distinct report; empty sends nothing", async () => {
  resetAliasReconcileSentForTests()
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const fetchImpl = (async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    return { ok: true, status: 200 } as Response
  }) as unknown as typeof fetch
  const quiet = console.info
  console.info = () => {}
  try {
    const base = { versionId: 7, mba: "malay003", source: "merge" as const, fetchImpl }
    const first = await reportWorkingBillingAliasReconcile({ ...base, entries })
    const again = await reportWorkingBillingAliasReconcile({ ...base, entries: [...entries].reverse() })
    const none = await reportWorkingBillingAliasReconcile({ ...base, entries: [] })
    const other = await reportWorkingBillingAliasReconcile({ ...base, source: "modal_open", entries })
    assert.ok(first)
    assert.equal(again, null)
    assert.equal(none, null)
    assert.ok(other)
    assert.equal(calls.length, 2)
    assert.equal(calls[0]!.url, "/api/billing-overrides/working-dedupe-anomaly")
    assert.equal(calls[0]!.body.kind, WORKING_BILLING_ALIAS_RECONCILE_KIND)
    assert.equal(calls[0]!.body.source, "merge")
    assert.equal(calls[1]!.body.source, "modal_open")
  } finally {
    console.info = quiet
  }
})

test("report never throws when the POST fails", async () => {
  resetAliasReconcileSentForTests()
  const quietInfo = console.info
  const quietWarn = console.warn
  console.info = () => {}
  console.warn = () => {}
  try {
    const out = await reportWorkingBillingAliasReconcile({
      versionId: 1,
      mba: "x",
      source: "attach",
      entries,
      fetchImpl: (async () => {
        throw new Error("offline")
      }) as unknown as typeof fetch,
    })
    assert.ok(out)
  } finally {
    console.info = quietInfo
    console.warn = quietWarn
  }
})
