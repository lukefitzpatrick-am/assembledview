/**
 * Billing revision routes: flag off 404, admin only, no_user 401, marker
 * missing 409, apply needs a token and confirm.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Gate =
  | { session: { user: { email: string; sub: string } }; roles: string[]; clientSlug: null; grantedByAllowlist: false }
  | { response: NextResponse }

const admin: Gate = {
  session: { user: { email: "luke@assembledmedia.com.au", sub: "auth0|luke" } },
  roles: ["admin"],
  clientSlug: null,
  grantedByAllowlist: false,
}
const requireFinanceAdminMock = mock.fn(async (): Promise<Gate> => admin)
const getCurrentUserMock = mock.fn(async (): Promise<{ id: number; name: string; email: string } | null> => ({
  id: 7,
  name: "Luke",
  email: "luke@assembledmedia.com.au",
}))
const markerMock = mock.fn(async () => true)
const previewMock = mock.fn(async (_args: Record<string, unknown>) => ({ ok: true, previewToken: "t", plan: {} }))
const applyMock = mock.fn(async (_args: Record<string, unknown>) => ({
  ok: true,
  result: { status: "published", newVersionNumber: 30 },
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireFinanceAdmin: requireFinanceAdminMock } })
  await mock.module("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: getCurrentUserMock } })
  await mock.module("@/lib/finance/revisions/marker", {
    namedExports: { isBillingRevisionsMigrationApplied: markerMock },
  })
  await mock.module("@/lib/finance/revisions/revisionService", {
    namedExports: {
      previewRevision: previewMock,
      applyRevisionFromToken: applyMock,
      currentRevisionMonth: () => "2026-10",
      listRevisions: async () => [],
      loadPanelContext: async () => ({ ok: true }),
      previewUndo: async () => ({ ok: true }),
    },
  })
}

const { POST: preview } = await import("../preview/route")
const { POST: apply } = await import("../apply/route")
const { GET: list } = await import("../route")

const body100k = {
  mbaNumber: "PENFOLD020",
  mode: "bill_amount",
  amount: 100000,
  unlockApprovedMonths: ["2026-10"],
  reason: "Client asked to bill $100k in October",
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost/api/finance/billing-revisions/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function reset() {
  process.env.BILLING_REVISIONS = "on"
  requireFinanceAdminMock.mock.mockImplementation(async () => admin)
  getCurrentUserMock.mock.mockImplementation(async () => ({ id: 7, name: "Luke", email: "luke@assembledmedia.com.au" }))
  markerMock.mock.mockImplementation(async () => true)
  previewMock.mock.resetCalls()
  applyMock.mock.resetCalls()
  requireFinanceAdminMock.mock.resetCalls()
}

test("flag off: 404 before auth", { skip }, async () => {
  reset()
  process.env.BILLING_REVISIONS = "off"
  const res = await preview(post("preview", body100k))
  assert.equal(res.status, 404)
  assert.equal(requireFinanceAdminMock.mock.callCount(), 0)
  const listed = await list(new NextRequest("http://localhost/api/finance/billing-revisions?mba=PENFOLD020"))
  assert.equal(listed.status, 404)
})

test("non-admin and client roles get 403, nothing runs", { skip }, async () => {
  reset()
  requireFinanceAdminMock.mock.mockImplementation(async () => ({
    response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
  }))
  assert.equal((await preview(post("preview", body100k))).status, 403)
  assert.equal((await apply(post("apply", { previewToken: "t", confirm: true }))).status, 403)
  assert.equal(previewMock.mock.callCount(), 0)
  assert.equal(applyMock.mock.callCount(), 0)
})

test("no audit user: 401 no_user", { skip }, async () => {
  reset()
  getCurrentUserMock.mock.mockImplementation(async () => ({ id: 0, name: "x", email: "x" }))
  const res = await preview(post("preview", body100k))
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error, "no_user")
})

test("marker missing: 409 not_ready", { skip }, async () => {
  reset()
  markerMock.mock.mockImplementation(async () => false)
  const res = await apply(post("apply", { previewToken: "t", confirm: true }))
  assert.equal(res.status, 409)
  assert.equal((await res.json()).message, "Billing revisions need migration 0106")
})

test("preview parses PENFOLD020 $100k and passes the session sub", { skip }, async () => {
  reset()
  const res = await preview(post("preview", body100k))
  assert.equal(res.status, 200)
  const args = previewMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(args.sub, "auth0|luke")
  assert.equal(args.source, "ui")
  assert.deepEqual(args.request, { mode: "bill_amount", intoMonth: "2026-10", amountCents: 10_000_000, strategy: "earliest_first" })
  assert.equal((await preview(post("preview", { ...body100k, reason: "" }))).status, 400)
})

test("apply needs confirm true and a token", { skip }, async () => {
  reset()
  assert.equal((await apply(post("apply", { previewToken: "t" }))).status, 400)
  assert.equal((await apply(post("apply", { confirm: true }))).status, 400)
  const res = await apply(post("apply", { previewToken: "tok", confirm: true }))
  assert.equal(res.status, 200)
  const args = applyMock.mock.calls[0]!.arguments[0] as Record<string, unknown>
  assert.equal(args.token, "tok")
  assert.equal(args.sub, "auth0|luke")
  assert.deepEqual(args.actor, { teamMemberId: 7, name: "Luke", email: "luke@assembledmedia.com.au" })
})
