import assert from "node:assert/strict"
import { test } from "node:test"

import { formatAccountRef } from "@/lib/clients/platformAccounts"
import { queryAdminWebReportList } from "@/lib/webReport/admin/list"

test("list query returns linked clients with report status from client_web_reports.status", () => {
  const rows = queryAdminWebReportList({
    clients: [
      { id: 1, name: "Meta Only", slug: "meta-only" },
      { id: 2, name: "Golf Australia", slug: "golf-australia" },
      { id: 3, name: "Paul Hartmann Pty Ltd", slug: "paul-hartmann" },
      { id: 4, name: "Report Only", slug: "report-only" },
    ],
    accounts: [
      { clientId: 1, platform: "meta_ads", accountRef: "1033480917" },
      { clientId: 2, platform: "ga4", accountRef: "123456789" },
      { clientId: 2, platform: "gsc", accountRef: "sc-domain:golf.com.au" },
      { clientId: 3, platform: "ga4", accountRef: "999" },
    ],
    reports: [
      {
        clientId: 3,
        status: "draft",
        updatedAt: "2026-10-01T00:00:00.000Z",
        updatedBy: "luke@assembled.media",
      },
      {
        clientId: 4,
        status: "published",
        updatedAt: "2026-09-01T00:00:00.000Z",
        updatedBy: "ava@assembled.media",
      },
    ],
    allowlist: new Set(["golf-australia"]),
  })

  assert.deepEqual(
    rows.map((row) => row.slug),
    ["golf-australia", "paul-hartmann", "report-only"],
  )

  const golf = rows.find((row) => row.slug === "golf-australia")!
  assert.equal(golf.status, "none")
  assert.equal(golf.statusField, "client_web_reports.status")
  assert.equal(golf.ga4Label, formatAccountRef("ga4", "123456789"))
  assert.equal(golf.gscLabel, "sc-domain:golf.com.au")
  assert.equal(golf.inClientAllowlist, true)
  assert.equal(golf.updatedAt, null)
  assert.equal(golf.updatedBy, null)

  const hartmann = rows.find((row) => row.slug === "paul-hartmann")!
  assert.equal(hartmann.status, "draft")
  assert.equal(hartmann.ga4Label, formatAccountRef("ga4", "999"))
  assert.equal(hartmann.gscLabel, "Not linked")
  assert.equal(hartmann.inClientAllowlist, false)
  assert.equal(hartmann.updatedBy, "luke@assembled.media")

  const reportOnly = rows.find((row) => row.slug === "report-only")!
  assert.equal(reportOnly.status, "published")
  assert.equal(reportOnly.ga4Label, "Not linked")
  assert.equal(reportOnly.gscLabel, "Not linked")
  assert.equal(reportOnly.updatedBy, "ava@assembled.media")
})
