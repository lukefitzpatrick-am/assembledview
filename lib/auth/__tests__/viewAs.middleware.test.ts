/**
 * Middleware and requireRole with a view-as overlay session.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"
import { buildViewAsPayload, buildViewAsUser, VIEW_AS_COOKIE, VIEW_AS_HINT_COOKIE } from "@/lib/auth/viewAs"

const skip = mockModuleSkip()

const ADMIN = {
  sub: "auth0|admin-luke",
  email: "luke.fitzpatrick@assembledmedia.com.au",
  "https://assembledview.com/roles": ["admin"],
  permissions: ["write:users"],
}
const overlayUser = buildViewAsUser(
  ADMIN,
  buildViewAsPayload({
    adminSub: ADMIN.sub,
    slug: "legal_super",
    clientId: 16,
    clientName: "Legal Super",
    minutes: 60,
    nowMs: Date.now(),
    nonce: "n",
  }),
)

let currentSession: { user: Record<string, unknown> } | null = null
const getSession = mock.fn(async () => currentSession)

if (typeof mock.module === "function") {
  await mock.module("@/lib/auth0", {
    namedExports: {
      auth0: { middleware: async () => undefined, getSession },
      auth0Raw: { middleware: async () => undefined, getSession },
    },
  })
}

function req(path: string, init: { method?: string; cookie?: string } = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: init.cookie } : undefined,
  })
}

const VIEWING = `${VIEW_AS_COOKIE}=signed; ${VIEW_AS_HINT_COOKIE}=legal_super`

test("view-as middleware: writes are 403 read_only_view_as and audited via waitUntil", { skip }, async () => {
  const { middleware } = await import("../../../middleware")
  currentSession = { user: overlayUser }
  const waited: Promise<unknown>[] = []
  const realFetch = globalThis.fetch
  const fetched: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(input))
    return new Response(null, { status: 204 })
  }) as typeof fetch
  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await middleware(req("/api/creative-assets/upload", { method, cookie: VIEWING }), {
        waitUntil: (p: Promise<unknown>) => waited.push(p),
      } as never)
      assert.equal(res.status, 403, method)
      assert.deepEqual((await res.json()).error, "read_only_view_as")
    }
    await Promise.all(waited)
    assert.equal(fetched.length, 4)
    assert.ok(fetched.every((url) => url === "http://localhost:3000/api/view-as/audit"))
    const page = await middleware(req("/dashboard/legal_super", { method: "POST", cookie: VIEWING }))
    assert.equal(page.status, 403)
  } finally {
    globalThis.fetch = realFetch
  }
})

test("view-as middleware: reads and the POST-as-read allowlist pass", { skip }, async () => {
  const { middleware } = await import("../../../middleware")
  currentSession = { user: overlayUser }
  for (const path of ["/api/pacing/bulk", "/api/pacing/conversions", "/api/view-as/exit"]) {
    const res = await middleware(req(path, { method: "POST", cookie: VIEWING }))
    assert.equal(res.headers.get("x-middleware-next"), "1", path)
  }
  const get = await middleware(req("/api/mediaplans/mba/legsu001", { cookie: VIEWING }))
  assert.equal(get.headers.get("x-middleware-next"), "1")
  const page = await middleware(req("/dashboard/legal_super", { cookie: VIEWING }))
  assert.equal(page.headers.get("x-middleware-next"), "1")
})

test("view-as middleware: the client fence applies (/client, /finance, other tenant)", { skip }, async () => {
  const { middleware } = await import("../../../middleware")
  currentSession = { user: overlayUser }
  for (const path of ["/client/legal_super", "/finance", "/admin/web-reports", "/dashboard/paul-hartmann-pty-ltd", "/"]) {
    const res = await middleware(req(path, { cookie: VIEWING }))
    assert.equal(res.headers.get("location"), "http://localhost:3000/dashboard/legal_super", path)
  }
  const fin = await middleware(req("/api/finance/sections/summary", { cookie: VIEWING }))
  assert.equal(fin.status, 403)
})

test("view-as middleware: a lapsed view sends an admin to /view-as/ended (pages) or 409 (APIs)", { skip }, async () => {
  const { middleware } = await import("../../../middleware")
  currentSession = { user: ADMIN }
  const hint = `${VIEW_AS_HINT_COOKIE}=legal_super`
  const page = await middleware(req("/dashboard/legal_super", { cookie: hint }))
  assert.equal(page.headers.get("location"), "http://localhost:3000/view-as/ended")
  const api = await middleware(req("/api/pacing/bulk", { method: "POST", cookie: hint }))
  assert.equal(api.status, 409)
  const ended = await middleware(req("/view-as/ended", { cookie: hint }))
  assert.equal(ended.headers.get("x-middleware-next"), "1")
  const exit = await middleware(req("/api/view-as/exit", { method: "POST", cookie: hint }))
  assert.equal(exit.headers.get("x-middleware-next"), "1")
  const plain = await middleware(req("/dashboard/legal_super"))
  assert.equal(plain.headers.get("x-middleware-next"), "1")
})

test("view-as middleware: logout clears both cookies", { skip }, async () => {
  const { middleware } = await import("../../../middleware")
  currentSession = { user: overlayUser }
  const res = await middleware(req("/auth/logout", { cookie: VIEWING }))
  const setCookie = res.headers.getSetCookie().join("\n")
  assert.match(setCookie, new RegExp(`${VIEW_AS_COOKIE.replace(/[-]/g, "\\-")}=;[^\n]*Max-Age=0`, "i"))
  assert.match(setCookie, new RegExp(`${VIEW_AS_HINT_COOKIE}=;[^\n]*Max-Age=0`, "i"))
  assert.match(setCookie, /Secure/i)
  assert.match(setCookie, /Path=\//i)
})

test("requireRole: the admin's email allowlist does not grant the overlay user", { skip }, async () => {
  const { requireRole } = await import("@/lib/requireRole")
  currentSession = { user: overlayUser }
  const denied = await requireRole(req("/api/admin/clients/refresh-slug", { method: "POST" }), "admin", {
    allowEmails: [ADMIN.email],
  })
  assert.ok("response" in denied)
  assert.equal("response" in denied && denied.response.status, 403)
  currentSession = { user: ADMIN }
  const ok = await requireRole(req("/api/admin/x"), "admin")
  assert.ok(!("response" in ok))
})

test("/api/me reports isAdmin false and the client role under the overlay", { skip }, async () => {
  const { GET } = await import("@/app/api/me/route")
  currentSession = { user: overlayUser }
  const body = await (await GET(req("/api/me"))).json()
  assert.equal(body.isAdmin, false)
  assert.deepEqual(body.roles, ["client"])
  assert.equal(body.user.email, "view-as+legal_super@assembledview.invalid")
})
