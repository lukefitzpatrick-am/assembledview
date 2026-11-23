/** S5: the unmatched delivery count in the pacing digest (switch unmatched_delivery_queue). */
import assert from "node:assert/strict"
import test from "node:test"

import { loadDigestUnmatchedDelivery, type DigestUnmatchedDelivery } from "../dataChecks.js"
import { buildPacingDigestEmailHtml } from "../email.js"
import type { PacingDigestPayload } from "../buildPacingDigest.js"
import type { UnmappedDeliveryRow } from "@/lib/pacing/admin/unmappedDelivery"

function row(firstDate: string, spend: number): UnmappedDeliveryRow {
  return {
    channel: "Social - Meta",
    platformEntityId: firstDate,
    name: "x",
    campaignName: "y",
    account: null,
    firstDate,
    lastDate: "2026-11-22",
    spend,
    impressions: 1,
    currentLineItemId: null,
    suggestion: { kind: "rename", mba: null, lineItemId: null, action: "z" },
  }
}

const HREF = "https://app.example/pacing/admin/relabels?tab=unmapped"
const deps = (over: Partial<Parameters<typeof loadDigestUnmatchedDelivery>[0]> = {}) => ({
  isOn: async () => true,
  load: async () => ({ windowDays: 30, rows: [row("2026-11-20", 10.1), row("2026-11-21", 20.2), row("2026-11-01", 0.05)] }),
  todayISO: "2026-11-23",
  href: HREF,
  ...over,
})

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn
  console.warn = () => {}
  return fn().finally(() => {
    console.warn = warn
  })
}

test("on: entities, spend to the cent, how many are 3 days or older, and the link", async () => {
  assert.deepEqual(await loadDigestUnmatchedDelivery(deps()), {
    status: "ok",
    windowDays: 30,
    entities: 3,
    spend: 30.35,
    noteDue: 2,
    href: HREF,
  })
})

test("off, or a switch read that throws: null and no queue read", async () => {
  let loads = 0
  const load = async () => {
    loads += 1
    return { windowDays: 30, rows: [] }
  }
  assert.equal(await loadDigestUnmatchedDelivery(deps({ isOn: async () => false, load })), null)
  const thrown = await quiet(() =>
    loadDigestUnmatchedDelivery(
      deps({
        isOn: async () => {
          throw new Error("db down")
        },
        load,
      }),
    ),
  )
  assert.equal(thrown, null)
  assert.equal(loads, 0)
})

test("a failed queue read (Snowflake down) is not available, not a throw", async () => {
  const out = await quiet(() =>
    loadDigestUnmatchedDelivery(
      deps({
        load: async () => {
          throw new Error("Snowflake connection refused")
        },
      }),
    ),
  )
  assert.equal(out?.status, "unavailable")
  assert.equal(out?.status === "unavailable" && out.reason, "error")
})

test("a queue read past the deadline is not available, and the digest does not wait for it", async () => {
  const started = Date.now()
  const out = await quiet(() =>
    loadDigestUnmatchedDelivery(deps({ load: () => new Promise((r) => setTimeout(() => r({ windowDays: 30, rows: [] }), 2_000)), deadlineMs: 20 })),
  )
  assert.equal(out?.status === "unavailable" && out.reason, "deadline")
  assert.ok(Date.now() - started < 1_000)
})

function payload(unmatched?: DigestUnmatchedDelivery): PacingDigestPayload {
  return {
    asOfDate: "2026-11-23",
    countToDate: "2026-11-22",
    builtAt: "2026-11-22T20:00:00.000Z",
    cacheNote: "",
    rows: [],
    atRisk: [],
    groups: { "at-risk": [], behind: [], on: [], ahead: [], "no-data": [] },
    counts: { atRisk: 0, behind: 0, on: 0, ahead: 0, noData: 0, total: 0 },
    relabels: { day: "2026-11-22", events: [], drift: [] },
    ...(unmatched ? { unmatched } : {}),
  }
}

test("email: the section counts, links the queue, and is absent when off", () => {
  const html = buildPacingDigestEmailHtml(
    payload({ status: "ok", windowDays: 30, entities: 3, spend: 30.35, noteDue: 1, href: HREF }),
  )
  assert.match(html, /Unmatched delivery: 3 platform entities, \$30\.35 spend in the last 30 days, on no published line\./)
  assert.match(html, /1 has been unmatched for 3 days or more and has a supplier note ready\./)
  assert.ok(html.includes(`<a href="${HREF}"`))
  assert.match(buildPacingDigestEmailHtml(payload({ status: "ok", windowDays: 30, entities: 0, spend: 0, noteDue: 0, href: HREF })), /Unmatched delivery: none\./)
  assert.match(
    buildPacingDigestEmailHtml(payload({ status: "unavailable", reason: "error", message: "x" })),
    /Unmatched delivery: check not available \(the query failed; see the cron log\)\./,
  )
  assert.doesNotMatch(buildPacingDigestEmailHtml(payload()), /Unmatched delivery/)
})

test("email: a blank APP_BASE_URL link still renders the count without a broken anchor", () => {
  const html = buildPacingDigestEmailHtml(payload({ status: "ok", windowDays: 30, entities: 2, spend: 1, noteDue: 2, href: "" }))
  assert.match(html, /2 have been unmatched for 3 days or more and have a supplier note ready\./)
  assert.doesNotMatch(html, /Open the queue/)
})
