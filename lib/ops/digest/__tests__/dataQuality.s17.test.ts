/** S17: open Data quality items by owner in the pacing digest (switch data_quality_queue). */
import assert from "node:assert/strict"
import test, { mock } from "node:test"

import type { DataQualityItem } from "@/lib/dataQuality/rules"

import { loadDigestDataQualitySection, type DigestDataQuality } from "../dataChecks.js"
import { buildPacingDigestEmailHtml } from "../email.js"
import type { PacingDigestPayload } from "../buildPacingDigest.js"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

if (supportsMockModule()) {
  await mock.module!("@/lib/dataQuality/items.server", {
    namedExports: { listOpenDataQualityItems: async () => [] },
  })
}

const NOW = new Date("2026-11-24T10:00:00Z")
const HREF = "https://app.example/data-quality"

function item(ownerEmail: string | null, ownerName: string | null, firstSeenAt: string, mbaNumber = "AAA001"): DataQualityItem {
  return {
    id: 1,
    ruleKey: "publish.no_publisher",
    mbaNumber,
    lineItemId: null,
    clientId: null,
    clientName: null,
    message: "m",
    fixLabel: "Open the plan",
    fixHref: "/mediaplans/mba/AAA001/edit",
    ownerEmail,
    ownerName,
    firstSeenAt,
    lastSeenAt: firstSeenAt,
  }
}

const deps = (over: Partial<Parameters<typeof loadDigestDataQualitySection>[0]> = {}) => ({
  isOn: async () => true,
  load: async () => [
    item("fin@am.test", "Fin <Owner>", "2026-11-01T00:00:00Z"),
    item("fin@am.test", "Fin <Owner>", "2026-11-24T00:00:00Z"),
    item(null, null, "2026-11-02T00:00:00Z"),
    item(null, null, "2026-11-03T00:00:00Z", "BBB002"),
    item("pub@am.test", null, "2026-11-23T00:00:00Z"),
  ],
  now: NOW,
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

test("on: open and overdue counts, owners most overdue first (unassigned is one owner across plans), the link", async () => {
  const out = await loadDigestDataQualitySection(deps())
  assert.deepEqual(out, {
    status: "ok",
    open: 5,
    overdue: 3,
    overdueAfterDays: 3,
    owners: [
      { ownerEmail: null, ownerName: null, open: 2, overdue: 2 },
      { ownerEmail: "fin@am.test", ownerName: "Fin <Owner>", open: 2, overdue: 1 },
      { ownerEmail: "pub@am.test", ownerName: null, open: 1, overdue: 0 },
    ],
    href: HREF,
  })
})

test("off, or a switch read that throws: null and no queue read", async () => {
  let loads = 0
  const load = async () => {
    loads += 1
    return []
  }
  assert.equal(await loadDigestDataQualitySection(deps({ isOn: async () => false, load })), null)
  const thrown = await quiet(() =>
    loadDigestDataQualitySection(
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

test("a failed or slow read is not available, and the digest does not wait", async () => {
  const failed = await quiet(() =>
    loadDigestDataQualitySection(
      deps({
        load: async () => {
          throw new Error("relation does not exist")
        },
      }),
    ),
  )
  assert.equal(failed?.status === "unavailable" && failed.reason, "error")
  const started = Date.now()
  const slow = await quiet(() =>
    loadDigestDataQualitySection(deps({ load: () => new Promise((r) => setTimeout(() => r([]), 2_000)), deadlineMs: 20 })),
  )
  assert.equal(slow?.status === "unavailable" && slow.reason, "deadline")
  assert.ok(Date.now() - started < 1_000)
})

function payload(dataQuality?: DigestDataQuality): PacingDigestPayload {
  return {
    asOfDate: "2026-11-24",
    countToDate: "2026-11-23",
    builtAt: "2026-11-23T22:30:00.000Z",
    cacheNote: "",
    rows: [],
    atRisk: [],
    groups: { "at-risk": [], behind: [], on: [], ahead: [], "no-data": [] },
    counts: { atRisk: 0, behind: 0, on: 0, ahead: 0, noData: 0, total: 0 },
    relabels: { day: "2026-11-23", events: [], drift: [] },
    ...(dataQuality ? { dataQuality } : {}),
  }
}

test("email: overdue counts only, owners with overdue items in order, escaped, with the link; absent when off", async () => {
  const out = await loadDigestDataQualitySection(deps())
  const html = buildPacingDigestEmailHtml(payload(out!))
  assert.match(html, /Data quality queue: 3 overdue items \(open more than 3 days\)\./)
  assert.ok(html.includes(`<a href="${HREF}"`))
  const owners = [...html.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1])
  assert.deepEqual(owners, ["Unassigned · 2 overdue", "Fin &lt;Owner&gt; · 1 overdue"])
  assert.doesNotMatch(html, /open item|· \d+ open/)
  assert.doesNotMatch(buildPacingDigestEmailHtml(payload()), /Data quality/)
})

test("email: nothing overdue, no link without APP_BASE_URL, and not available", () => {
  const empty = buildPacingDigestEmailHtml(
    payload({ status: "ok", open: 2, overdue: 0, overdueAfterDays: 3, owners: [{ ownerEmail: null, ownerName: null, open: 2, overdue: 0 }], href: "" }),
  )
  assert.match(empty, /Data quality queue: nothing overdue\./)
  assert.doesNotMatch(empty, /<li>/)
  assert.doesNotMatch(empty, /Open the queue/)
  assert.match(
    buildPacingDigestEmailHtml(payload({ status: "unavailable", reason: "error", message: "x" })),
    /Data quality queue: check not available \(the query failed; see the cron log\)\./,
  )
})

test("live loader: an absolute link from APP_BASE_URL, trailing slash trimmed; unset: no link", { skip: mockModuleSkip() }, async () => {
  const row = { key: "data_quality_queue", enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
  setFeatureRowReaderForTests(async () => new Map([["data_quality_queue", row]]))
  const before = process.env.APP_BASE_URL
  try {
    const { loadDigestDataQuality } = await import("../loadDataChecks.js")
    process.env.APP_BASE_URL = " https://app.example/ "
    const on = await loadDigestDataQuality(NOW)
    assert.equal(on?.status === "ok" && on.href, "https://app.example/data-quality")
    delete process.env.APP_BASE_URL
    const unset = await loadDigestDataQuality(NOW)
    assert.equal(unset?.status === "ok" && unset.href, "")
  } finally {
    if (before === undefined) delete process.env.APP_BASE_URL
    else process.env.APP_BASE_URL = before
    setFeatureRowReaderForTests(null)
  }
})
