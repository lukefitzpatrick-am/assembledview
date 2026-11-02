/**
 * POST /api/admin/features/save-current (B7, G9): admin and finance admin,
 * both checked before any write; production deployment only (B7 review 2);
 * 409 until 0111; returns what it saved.
 */
import assert from "node:assert/strict"
import { after, mock, test } from "node:test"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

type Gate = { session: { user: { email: string; sub: string } }; roles: string[] } | { response: NextResponse }
const admin: Gate = { session: { user: { email: "luke@assembledmedia.com.au", sub: "auth0|luke" } }, roles: ["admin"] }
const forbidden = (): Gate => ({ response: NextResponse.json({ error: "forbidden" }, { status: 403 }) })
const requireAdminMock = mock.fn(async (): Promise<Gate> => admin)
const requireFinanceAdminMock = mock.fn(async (): Promise<Gate> => admin)
const saveMock = mock.fn(async (_args: { actor: { id: number | null; name: string | null } }) => ({
  ok: true as const,
  saved: [{ key: "web_search", enabled: false, source: "default" as const }],
}))

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", { namedExports: { requireAdmin: requireAdminMock, requireFinanceAdmin: requireFinanceAdminMock } })
  await mock.module("@/lib/auth/getCurrentUser", {
    namedExports: { getCurrentUser: async () => ({ id: 7, name: "Luke", email: "luke@assembledmedia.com.au" }) },
  })
  await mock.module("@/lib/features/server", { namedExports: { saveCurrentFeatureValues: saveMock } })
}

const { POST } = await import("../save-current/route")
const { SAVE_CURRENT_NOT_PRODUCTION_MESSAGE } = await import("@/lib/features/registry")

const savedVercelEnv = process.env.VERCEL_ENV
process.env.VERCEL_ENV = "production"
after(() => {
  if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = savedVercelEnv
})

const post = () => new NextRequest("http://localhost/api/admin/features/save-current", { method: "POST" })

test("a non-admin or a non-finance admin can't save, and nothing is written", { skip }, async () => {
  const before = saveMock.mock.callCount()
  requireAdminMock.mock.mockImplementationOnce(async () => forbidden())
  assert.equal((await POST(post())).status, 403)
  requireFinanceAdminMock.mock.mockImplementationOnce(async () => forbidden())
  assert.equal((await POST(post())).status, 403)
  assert.equal(saveMock.mock.callCount(), before)
})

test("an admin saves; the actor is the signed-in user; the result passes through", { skip }, async () => {
  const res = await POST(post())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, saved: [{ key: "web_search", enabled: false, source: "default" }] })
  assert.deepEqual(saveMock.mock.calls.at(-1)?.arguments[0], { actor: { id: 7, name: "Luke" } })
})

test("0111 missing is a 409", { skip }, async () => {
  saveMock.mock.mockImplementationOnce(async () => ({ ok: false, status: 409, code: "NOT_READY", message: "0111" }) as never)
  const res = await POST(post())
  assert.equal(res.status, 409)
  assert.equal(((await res.json()) as { error: string }).error, "NOT_READY")
})

test("outside the production deployment it refuses with 403 and writes nothing", { skip }, async () => {
  const before = saveMock.mock.callCount()
  try {
    for (const env of ["preview", "development", undefined, "Production"]) {
      if (env === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = env
      const res = await POST(post())
      assert.equal(res.status, 403, String(env))
      assert.deepEqual(await res.json(), { error: "NOT_PRODUCTION", message: SAVE_CURRENT_NOT_PRODUCTION_MESSAGE })
    }
    assert.equal(saveMock.mock.callCount(), before)
  } finally {
    process.env.VERCEL_ENV = "production"
  }
  assert.equal((await POST(post())).status, 200, "production saves")
})

test("the production check runs after the role checks, so a non-admin still gets 403 forbidden", { skip }, async () => {
  try {
    process.env.VERCEL_ENV = "preview"
    requireAdminMock.mock.mockImplementationOnce(async () => forbidden())
    const res = await POST(post())
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { error: "forbidden" })
  } finally {
    process.env.VERCEL_ENV = "production"
  }
})
