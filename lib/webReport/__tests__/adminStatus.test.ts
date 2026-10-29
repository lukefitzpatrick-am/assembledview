import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  platformAccountsHref,
  resolveWebReportAdminStatus,
  webReportBuilderHref,
  webReportStateTone,
  webReportStatusesBySlug,
  webReportViewerHref,
} from "@/lib/webReport/admin/status"
import { resolveWebPageMode } from "@/lib/webReport/admin/pageMode"
import { filterAdminWebReportRows, webSearchPaletteEntries } from "@/lib/webReport/admin/search"
import type { AdminWebReportListRow } from "@/lib/webReport/admin/list"

const published = { status: "published", currentVersion: 4 }

describe("web report admin status", () => {
  it("no report row is Not set up, whatever the accounts", () => {
    const none = resolveWebReportAdminStatus({ report: null, ga4Count: 0, gscCount: 0, flagOn: true })
    assert.equal(none.state, "not_set_up")
    assert.equal(none.label, "Not set up")
    assert.equal(none.hasReport, false)
    const golf = resolveWebReportAdminStatus({ report: null, ga4Count: 1, gscCount: 0, flagOn: true })
    assert.equal(golf.state, "not_set_up")
    assert.equal(golf.ga4Connected, true)
    assert.equal(golf.gscConnected, false)
    assert.equal(golf.clientCanSee, false)
  })

  it("a report with no GA4 and no Search Console is Accounts missing", () => {
    const status = resolveWebReportAdminStatus({ report: published, ga4Count: 0, gscCount: 0, flagOn: true })
    assert.equal(status.state, "accounts_missing")
    assert.equal(status.label, "Accounts missing")
    assert.equal(status.published, true)
  })

  it("published needs status published and a version above 0", () => {
    const ok = resolveWebReportAdminStatus({ report: published, ga4Count: 1, gscCount: 1, flagOn: true })
    assert.equal(ok.state, "published")
    assert.equal(ok.clientCanSee, true)
    const v0 = resolveWebReportAdminStatus({
      report: { status: "published", currentVersion: 0 },
      ga4Count: 1,
      gscCount: 0,
      flagOn: true,
    })
    assert.equal(v0.state, "draft")
    const draft = resolveWebReportAdminStatus({
      report: { status: "draft", currentVersion: 2 },
      ga4Count: 0,
      gscCount: 1,
      flagOn: true,
    })
    assert.equal(draft.state, "draft")
    assert.equal(draft.label, "Draft")
  })

  it("the client sees it only when published and the switch is on", () => {
    const off = resolveWebReportAdminStatus({ report: published, ga4Count: 1, gscCount: 1, flagOn: false })
    assert.equal(off.state, "published")
    assert.equal(off.clientCanSee, false)
  })

  it("tones: published outcome, draft and accounts missing attention, not set up neutral", () => {
    assert.equal(webReportStateTone("published"), "outcome")
    assert.equal(webReportStateTone("draft"), "attention")
    assert.equal(webReportStateTone("accounts_missing"), "attention")
    assert.equal(webReportStateTone("not_set_up"), "neutral")
  })

  it("batch keys by lower-case slug, skips no-slug clients and inactive accounts", () => {
    const bySlug = webReportStatusesBySlug(
      {
        clients: [
          { id: 12, slug: "paul-hartmann-pty-ltd" },
          { id: 16, slug: "legal_super" },
          { id: 20, slug: "Golf-Australia" },
          { id: 30, slug: null },
          { id: 31, slug: "  " },
        ],
        reports: [
          { clientId: 12, status: "published", currentVersion: 4 },
          { clientId: 16, status: "published", currentVersion: 1 },
        ],
        accounts: [
          { clientId: 12, platform: "ga4", active: true },
          { clientId: 12, platform: "gsc", active: true },
          { clientId: 16, platform: "ga4", active: false },
          { clientId: 16, platform: "gsc", active: false },
          { clientId: 20, platform: "ga4", active: true },
        ],
      },
      true,
    )
    assert.deepEqual(Object.keys(bySlug).sort(), ["golf-australia", "legal_super", "paul-hartmann-pty-ltd"])
    assert.equal(bySlug["paul-hartmann-pty-ltd"]!.state, "published")
    assert.equal(bySlug["legal_super"]!.state, "accounts_missing")
    assert.equal(bySlug["golf-australia"]!.state, "not_set_up")
    assert.equal(bySlug["golf-australia"]!.ga4Connected, true)
  })

  it("links: viewer, builder and the hub accounts anchor", () => {
    assert.equal(webReportViewerHref("legal_super"), "/dashboard/legal_super/web")
    assert.equal(webReportBuilderHref("legal_super"), "/admin/web-reports/legal_super")
    assert.equal(platformAccountsHref("legal_super"), "/client/legal_super#platform-accounts")
  })
})

describe("web report page mode", () => {
  const status = (state: "published" | "draft" | "not_set_up" | "accounts_missing") => ({
    state,
    label: state,
    hasReport: state !== "not_set_up",
    published: state === "published",
    ga4Connected: state !== "accounts_missing",
    gscConnected: false,
    clientCanSee: state === "published",
  })

  it("clients keep the 404 when the switch is off", () => {
    assert.deepEqual(resolveWebPageMode({ isAdmin: false, flagOn: false, status: null }), { kind: "not_found" })
    assert.deepEqual(resolveWebPageMode({ isAdmin: false, flagOn: true, status: null }), { kind: "client_report" })
  })

  it("admins never get a 404 for the switch: a notice instead", () => {
    const mode = resolveWebPageMode({ isAdmin: true, flagOn: false, status: status("published") })
    assert.equal(mode.kind, "admin_report")
    assert.equal(mode.kind === "admin_report" && mode.flagOff, true)
    assert.equal(mode.kind === "admin_report" && mode.strip, null)
  })

  it("no report row is the setup state, with or without the switch", () => {
    for (const flagOn of [true, false]) {
      const mode = resolveWebPageMode({ isAdmin: true, flagOn, status: status("not_set_up") })
      assert.equal(mode.kind, "admin_setup")
      assert.equal(mode.kind === "admin_setup" && mode.flagOff, !flagOn)
    }
  })

  it("draft and accounts missing add a strip", () => {
    const draft = resolveWebPageMode({ isAdmin: true, flagOn: true, status: status("draft") })
    assert.equal(draft.kind === "admin_report" && draft.strip, "draft")
    const missing = resolveWebPageMode({ isAdmin: true, flagOn: true, status: status("accounts_missing") })
    assert.equal(missing.kind === "admin_report" && missing.strip, "accounts_missing")
  })

  it("a failed status read shows the report with no strip", () => {
    const mode = resolveWebPageMode({ isAdmin: true, flagOn: true, status: null })
    assert.deepEqual(mode, { kind: "admin_report", flagOff: false, strip: null, status: null })
  })
})

describe("analytics search and palette entries", () => {
  const row = (clientName: string, slug: string | null, status: "none" | "draft" | "published"): AdminWebReportListRow => ({
    clientId: clientName.length,
    clientName,
    slug,
    ga4Label: "Not linked",
    gscLabel: "Not linked",
    status,
    statusField: "client_web_reports.status",
    updatedAt: null,
    updatedBy: null,
    clientTabOn: false,
  })
  const rows = [
    row("legalsuper", "legal_super", "published"),
    row("Paul Hartmann", "paul-hartmann-pty-ltd", "published"),
    row("Golf Australia", "golf-australia", "none"),
  ]

  it("filters by client name or slug; empty keeps all", () => {
    assert.equal(filterAdminWebReportRows(rows, "").length, 3)
    assert.deepEqual(filterAdminWebReportRows(rows, "hart").map((r) => r.slug), ["paul-hartmann-pty-ltd"])
    assert.deepEqual(filterAdminWebReportRows(rows, "legal_super").map((r) => r.slug), ["legal_super"])
    assert.equal(filterAdminWebReportRows(rows, "zzz").length, 0)
  })

  it("palette lists only clients with a report", () => {
    const entries = webSearchPaletteEntries(rows)
    assert.deepEqual(
      entries.map((e) => [e.label, e.href]),
      [
        ["Web & search: legalsuper", "/dashboard/legal_super/web"],
        ["Web & search: Paul Hartmann", "/dashboard/paul-hartmann-pty-ltd/web"],
      ],
    )
  })
})
