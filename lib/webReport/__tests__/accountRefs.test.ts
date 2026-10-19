import assert from "node:assert/strict"
import { test } from "node:test"

import { pickReportAccounts, type ReportAccountRow } from "@/lib/webReport/accountRefs"
import { parseBuilderRequest } from "@/lib/webReport/builder/request"

function row(
  id: number,
  platform: string,
  accountRef: string,
  createdAt: string,
  active = true,
  label: string | null = null,
): ReportAccountRow {
  return { id, platform, accountRef, label, active, createdAt }
}

const LINKED = [
  row(1, "ga4", "properties/372647707", "2026-09-01T00:00:00Z", true, "HartmannDirect AU GA4"),
  row(2, "gsc", "https://www.molicare.au/", "2026-09-01T00:00:00Z"),
]

const NONE = { ga4PropertyId: null, ga4PropertyName: null, gscSite: null, duplicates: [] }

test("accounts come from platform rows only", () => {
  assert.deepEqual(pickReportAccounts(LINKED), {
    ga4PropertyId: "372647707",
    ga4PropertyName: "HartmannDirect AU GA4",
    gscSite: "https://www.molicare.au/",
    duplicates: [],
  })
})

test("a GA4 row with a blank label has no property name", () => {
  const picked = pickReportAccounts([row(1, "ga4", "372647707", "2026-09-01T00:00:00Z", true, "  ")])
  assert.equal(picked.ga4PropertyId, "372647707")
  assert.equal(picked.ga4PropertyName, null)
})

test("refs sent with a builder request are dropped before the save", () => {
  const parsed = parseBuilderRequest({
    action: "save",
    layout: [{ elementId: "notes", settings: { text: "Hi" } }],
    ga4PropertyRef: "999",
    gscSiteRef: "https://example.com/",
    brandTerms: [],
    defaultPeriod: "last_month",
  })
  assert.equal(parsed.ok, true)
  if (parsed.ok && parsed.action === "save") {
    assert.equal("ga4PropertyRef" in parsed.body, false)
    assert.equal("gscSiteRef" in parsed.body, false)
  }
})

test("a client with no platform accounts is not linked", () => {
  assert.deepEqual(pickReportAccounts([]), NONE)
  const inactive = LINKED.map((account) => ({ ...account, active: false }))
  assert.deepEqual(pickReportAccounts(inactive), NONE)
})

test("a second active row does not change the result; the oldest wins and is flagged", () => {
  const withNewer = [
    ...LINKED,
    row(3, "ga4", "111111111", "2026-10-01T00:00:00Z", true, "Newer"),
    row(4, "gsc", "https://a.example/", "2026-10-01T00:00:00Z"),
  ]
  const picked = pickReportAccounts(withNewer)
  assert.equal(picked.ga4PropertyId, "372647707")
  assert.equal(picked.ga4PropertyName, "HartmannDirect AU GA4")
  assert.equal(picked.gscSite, "https://www.molicare.au/")
  assert.deepEqual(picked.duplicates, ["ga4", "gsc"])
})

test("same created time falls back to the lower id; unusable refs are skipped", () => {
  const picked = pickReportAccounts([
    row(9, "ga4", "222", "2026-09-01T00:00:00Z"),
    row(5, "ga4", "333", "2026-09-01T00:00:00Z"),
    row(1, "ga4", "not-a-property", "2026-01-01T00:00:00Z"),
    row(2, "gsc", "   ", "2026-01-01T00:00:00Z"),
  ])
  assert.equal(picked.ga4PropertyId, "333")
  assert.equal(picked.gscSite, null)
})
