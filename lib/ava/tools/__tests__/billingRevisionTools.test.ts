/**
 * Ava billing revision tools (C8): offer rules, admin only, confirm and
 * token required, a token from another user is refused.
 * Run with --experimental-test-module-mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

import type { AvaToolContext } from "../types"

const skip = mockModuleSkip()

if (typeof mock.module === "function") {
  await mock.module("@/lib/finance/revisions/marker", {
    namedExports: {
      isBillingRevisionsMigrationApplied: async () => true,
      assertBillingRevisionsReady: async () => {},
      BillingRevisionsNotReadyError: class extends Error {},
      readMigrationMarker: async () => true,
    },
  })
  await mock.module("@/lib/auth/teamMemberAuditId", {
    namedExports: { lookupTeamMemberAuditId: async () => 7 },
  })
}

const { previewBillingRevisionTool } = await import("../previewBillingRevision")
const { applyBillingRevisionTool } = await import("../applyBillingRevision")
const { avaToolDefinitionsForPage } = await import("../pageToolOffer")
const { signPreviewToken } = await import("@/lib/finance/revisions/previewToken")

function ctx(over: Partial<AvaToolContext> = {}): AvaToolContext {
  return {
    pageContext: undefined,
    clientSlug: undefined,
    mbaNumber: "PENFOLD020",
    versionNumber: undefined,
    enabledMediaTypes: undefined,
    userSub: "auth0|luke",
    userEmail: "luke@assembledmedia.com.au",
    roles: ["admin"],
    clientSlugs: [],
    mbaNumbers: [],
    capturedPatch: null,
    capturedAttachments: null,
    capturedQuestions: null,
    pendingParsedPlan: null,
    capturedLineItemsLoad: null,
    currentLineItems: null,
    ...over,
  }
}

const defs = [{ name: "get_media_plan_summary" }, { name: "preview_billing_revision" }, { name: "apply_billing_revision" }]
const names = (pathname: string) => avaToolDefinitionsForPage(defs, { route: { pathname } }).map((d) => d.name)

test("offered on /finance and the MBA page only when BILLING_REVISIONS is on", { skip }, () => {
  process.env.BILLING_REVISIONS = "off"
  assert.deepEqual(names("/finance/invoicing"), ["get_media_plan_summary"])
  process.env.BILLING_REVISIONS = "on"
  assert.ok(names("/finance/invoicing").includes("apply_billing_revision"))
  assert.ok(names("/mediaplans/mba/PENFOLD020").includes("preview_billing_revision"))
  assert.equal(names("/mediaplans/mba/PENFOLD020/edit").includes("preview_billing_revision"), false)
  assert.equal(names("/mediaplans/create").includes("preview_billing_revision"), false)
  assert.equal(names("/pacing/portfolio").includes("preview_billing_revision"), false)
  assert.equal(avaToolDefinitionsForPage(defs, undefined).some((d) => d.name === "apply_billing_revision"), false)
})

test("non-admin refused on both tools", { skip }, async () => {
  process.env.BILLING_REVISIONS = "on"
  const p = await previewBillingRevisionTool.execute({ mode: "bill_remainder", reason: "r" }, ctx({ roles: ["client"] as never }))
  assert.equal(p.isError, true)
  assert.match(p.content, /admin-only/)
  const a = await applyBillingRevisionTool.execute({ confirm: true, previewToken: "x" }, ctx({ roles: ["client"] as never }))
  assert.equal(a.isError, true)
})

test("flag off: tools refuse even if called", { skip }, async () => {
  process.env.BILLING_REVISIONS = "off"
  const p = await previewBillingRevisionTool.execute({ mode: "bill_remainder", reason: "r" }, ctx())
  assert.match(p.content, /turned off/)
})

test("apply needs confirm true and a preview token", { skip }, async () => {
  process.env.BILLING_REVISIONS = "on"
  const noConfirm = await applyBillingRevisionTool.execute({ confirm: false, previewToken: "x" }, ctx())
  assert.match(noConfirm.content, /confirm/)
  const noToken = await applyBillingRevisionTool.execute({ confirm: true, previewToken: "" }, ctx())
  assert.match(noToken.content, /preview_billing_revision first/)
})

test("a token from another user is refused", { skip }, async () => {
  process.env.BILLING_REVISIONS = "on"
  process.env.BILLING_REVISION_TOKEN_SECRET = "test-secret-at-least-16"
  const signed = signPreviewToken({
    mbaNumber: "PENFOLD020",
    baseVersionId: 16999,
    hash: "h",
    request: { mode: "bill_remainder", intoMonth: "2026-10" },
    options: { unlockApprovedMonths: [], includeProduction: false, feeMode: "follow", adservingMode: "keep" },
    reason: "r",
    source: "ava",
    restoresRevisionId: null,
    sub: "auth0|someone-else",
  })
  assert.ok("token" in signed)
  const out = await applyBillingRevisionTool.execute({ confirm: true, previewToken: signed.token }, ctx())
  assert.equal(out.isError, true)
  assert.match(out.content, /TOKEN_OTHER_USER/)
})

test("preview refuses a bad request before any DB read", { skip }, async () => {
  process.env.BILLING_REVISIONS = "on"
  const out = await previewBillingRevisionTool.execute({ mode: "bill_amount", reason: "r" }, ctx())
  assert.equal(out.isError, true)
  assert.match(out.content, /amount/)
  const restore = await previewBillingRevisionTool.execute({ mode: "restore", reason: "r" }, ctx())
  assert.match(restore.content, /revisionId/)
})
