/**
 * /api/admin/features: admin to read; finance switches need finance admin;
 * the role is checked before the key; Vercel switches and unknown keys are
 * refused; 409 until 0111.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Gate = { session: { user: { email: string; sub: string } }; roles: string[] } | { response: NextResponse }
const admin: Gate = { session: { user: { email: "luke@assembledmedia.com.au", sub: "auth0|luke" } }, roles: ["admin"] }
const forbidden = (): Gate => ({ response: NextResponse.json({ error: "forbidden" }, { status: 403 }) })
const requireAdminMock = mock.fn(async (): Promise<Gate> => admin)
const requireFinanceAdminMock = mock.fn(async (): Promise<Gate> => admin)
const setMock = mock.fn(async (args: { key: string; enabled: boolean }) => ({ ok: true, key: args.key, enabled: args.enabled, changed: true }))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireAdmin: requireAdminMock, requireFinanceAdmin: requireFinanceAdminMock } })
  await mock.module("@/lib/auth/getCurrentUser", {
    namedExports: { getCurrentUser: async () => ({ id: 7, name: "Luke", email: "luke@assembledmedia.com.au" }) },
  })
  await mock.module("@/lib/features/server", {
    namedExports: {
      readFeatureStates: async () => ({ ready: true, states: [] }),
      readFeatureSwitchEvents: async () => [],
      setFeatureSwitch: setMock,
    },
  })
}

const { GET, POST } = await import("../route")

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/features", { method: "POST", body: JSON.stringify(body) })

test("a client can't read or toggle", { skip }, async () => {
  requireAdminMock.mock.mockImplementationOnce(async () => forbidden())
  assert.equal((await GET(new NextRequest("http://localhost/api/admin/features"))).status, 403)
  requireAdminMock.mock.mockImplementationOnce(async () => forbidden())
  assert.equal((await POST(post({ key: "web_search", enabled: true }))).status, 403)
})

test("finance switches go through the finance admin check; others the admin check", { skip }, async () => {
  const fin = requireFinanceAdminMock.mock.callCount()
  const adm = requireAdminMock.mock.callCount()
  assert.equal((await POST(post({ key: "true_up_actions", enabled: true }))).status, 200)
  assert.equal(requireFinanceAdminMock.mock.callCount(), fin + 1)
  assert.equal((await POST(post({ key: "codex_v2", enabled: false }))).status, 200)
  assert.equal(requireAdminMock.mock.callCount(), adm + 1)
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => forbidden())
  assert.equal((await POST(post({ key: "true_up", enabled: true }))).status, 403)
})

test("bad shapes are 400 and never reach the write", { skip }, async () => {
  const before = setMock.mock.callCount()
  assert.equal((await POST(post({ key: "nope", enabled: true }))).status, 400)
  assert.equal((await POST(post({ key: "web_search", enabled: "yes" }))).status, 400)
  assert.equal((await POST(post({ key: "web_search", enabled: true, note: 5 }))).status, 400)
  assert.equal(setMock.mock.callCount(), before)
})

test("service refusals pass through (Vercel switch 400, 0111 missing 409)", { skip }, async () => {
  setMock.mock.mockImplementationOnce(async () => ({ ok: false, status: 400, code: "SET_IN_VERCEL", message: "Set in Vercel." }) as never)
  assert.equal((await POST(post({ key: "view_as", enabled: true }))).status, 400)
  setMock.mock.mockImplementationOnce(async () => ({ ok: false, status: 409, code: "NOT_READY", message: "0111" }) as never)
  assert.equal((await POST(post({ key: "web_search", enabled: true }))).status, 409)
})

test("GET returns the groups, history and signing key status", { skip }, async () => {
  const res = await GET(new NextRequest("http://localhost/api/admin/features"))
  assert.equal(res.status, 200)
  const body = (await res.json()) as { ready: boolean; groups: unknown[]; signing: { purpose: string }[] }
  assert.equal(body.ready, true)
  assert.ok(body.groups.length > 0)
  assert.deepEqual(body.signing.map((s) => s.purpose), ["view-as", "billing-revision-preview"])
})
