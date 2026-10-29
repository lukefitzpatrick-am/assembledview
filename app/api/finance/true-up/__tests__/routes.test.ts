/**
 * True-up fix routes: finance admin first, 404 while TRUE_UP_ACTIONS is off,
 * 409 until 0109, no_user 401, request shapes checked before the service.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Gate = { session: { user: { email: string; sub: string } }; roles: string[] } | { response: NextResponse }
const admin: Gate = { session: { user: { email: "luke@assembledmedia.com.au", sub: "auth0|luke" } }, roles: ["admin"] }
const requireFinanceAdminMock = mock.fn(async (): Promise<Gate> => admin)
const getCurrentUserMock = mock.fn(async (): Promise<{ id: number; name: string; email: string } | null> => ({
  id: 7,
  name: "Luke",
  email: "luke@assembledmedia.com.au",
}))
let gateResult: { ok: false; status: number; code: string; message: string } | null = null
const previewMock = mock.fn(async (_a: Record<string, unknown>) => ({ ok: true, previewToken: "t" }))
const applyMock = mock.fn(async (_a: Record<string, unknown>) => ({ ok: true, kind: "true_up", revisionId: 1 }))
const noteMock = mock.fn(async (_a: Record<string, unknown>) => ({ ok: true, id: 3, gapCents: -500 }))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireFinanceAdmin: requireFinanceAdminMock } })
  await mock.module("@/lib/auth/getCurrentUser", { namedExports: { getCurrentUser: getCurrentUserMock } })
  await mock.module("@/lib/finance/trueUp/service", {
    namedExports: {
      trueUpActionsGate: async () => gateResult,
      previewTrueUpFix: previewMock,
      applyTrueUpFromToken: applyMock,
      previewTrueUpUndo: async () => ({ ok: true }),
      recordTrueUpNote: noteMock,
      undoTrueUpNote: async () => ({ ok: true }),
      listTrueUpInvoiceLinks: async () => [],
      addTrueUpInvoiceLink: async () => ({ ok: true, id: 1 }),
      removeTrueUpInvoiceLink: async () => ({ ok: true }),
      readClientBillingTimings: async () => ({}),
      setClientBillingTiming: async () => ({ ok: true, timing: "month_ahead" }),
    },
  })
}

const { POST: preview } = await import("../preview/route")
const { POST: apply } = await import("../apply/route")
const { POST: notes } = await import("../notes/route")

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/finance/true-up/x", { method: "POST", body: JSON.stringify(body) })

test("finance admin is checked first; a non-admin never reaches the flag", { skip }, async () => {
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => ({ response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }))
  gateResult = { ok: false, status: 404, code: "NOT_FOUND", message: "Not found" }
  const res = await preview(req({}))
  assert.equal(res.status, 403)
})

test("404 while TRUE_UP_ACTIONS is off, 409 until 0109", { skip }, async () => {
  gateResult = { ok: false, status: 404, code: "NOT_FOUND", message: "Not found" }
  assert.equal((await preview(req({}))).status, 404)
  gateResult = { ok: false, status: 409, code: "NOT_READY", message: "0109" }
  assert.equal((await apply(req({}))).status, 409)
  gateResult = null
})

test("no audit user is 401", { skip }, async () => {
  gateResult = null
  getCurrentUserMock.mock.mockImplementationOnce(async () => null)
  assert.equal((await preview(req({ mbaNumber: "golf025", asOf: "2026-10", components: ["fee"], strategy: "spread" }))).status, 401)
})

test("shapes are checked before the service is called", { skip }, async () => {
  gateResult = null
  const before = previewMock.mock.callCount()
  assert.equal((await preview(req({ mbaNumber: "golf025", asOf: "2026-10", components: ["fee"] }))).status, 400)
  assert.equal(previewMock.mock.callCount(), before)
  assert.equal((await apply(req({ previewToken: "t" }))).status, 400)
  assert.equal((await notes(req({ mbaNumber: "golf025", asOf: "2026-10", component: "fee", action: "delete" }))).status, 400)
  const ok = await preview(req({ mbaNumber: "golf025", asOf: "2026-10", components: ["fee", "nonsense"], strategy: "carry" }))
  assert.equal(ok.status, 200)
  const call = previewMock.mock.calls.at(-1)!.arguments[0] as { choice: { components: string[]; strategy: string }; sub: string }
  assert.deepEqual(call.choice.components, ["fee"])
  assert.equal(call.choice.strategy, "carry")
  assert.equal(call.sub, "auth0|luke")
})

test("apply passes the token, the user and the actor", { skip }, async () => {
  gateResult = null
  const res = await apply(req({ previewToken: "abc", confirm: true }))
  assert.equal(res.status, 200)
  const call = applyMock.mock.calls.at(-1)!.arguments[0] as { token: string; sub: string; actor: { teamMemberId: number } }
  assert.equal(call.token, "abc")
  assert.equal(call.actor.teamMemberId, 7)
})
