/**
 * POST /api/admin/view-as (start), POST /api/view-as/exit, POST /api/view-as/audit.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"
import {
  buildViewAsPayload,
  signViewAsPayload,
  verifyViewAsToken,
  VIEW_AS_COOKIE,
  VIEW_AS_HINT_COOKIE,
} from "@/lib/auth/viewAs"

const skip = mockModuleSkip()
const SECRET = "k".repeat(40)
process.env.VIEW_AS_SECRET = SECRET

const ADMIN = { sub: "auth0|admin-luke", email: "luke@assembledmedia.com.au", "https://assembledview.com/roles": ["admin"] }
const CLIENT = { sub: "auth0|c1", email: "meg@legalsuper.com.au", "https://assembledview.com/roles": ["client"] }

let rawSession: { user: Record<string, unknown> } | null = { user: ADMIN }
const getSession = mock.fn(async () => rawSession)
const audits: Array<Record<string, unknown>> = []
let auditFails = false

if (typeof mock.module === "function") {
  await mock.module("@/lib/auth0", {
    namedExports: { auth0Raw: { getSession }, auth0: { getSession } },
  })
  await mock.module("@/lib/auth/viewAsAudit", {
    namedExports: {
      insertViewAsAudit: async (row: Record<string, unknown>) => {
        if (auditFails) throw new Error("relation view_as_audit does not exist")
        audits.push(row)
      },
      insertViewAsAuditSoft: async (row: Record<string, unknown>) => {
        audits.push(row)
        return true
      },
    },
  })
  await mock.module("@/lib/clients/fetchClientRowByUrlSlug", {
    namedExports: {
      fetchXanoClientRowByUrlSlug: async (slug: string) =>
        slug === "legal_super" ? { id: 16, mp_client_name: "legalsuper", slug: "legal_super" } : null,
    },
  })
}

function post(path: string, body: unknown, cookie?: string, origin?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (cookie) headers.cookie = cookie
  if (origin) headers.origin = origin
  return new NextRequest(`http://localhost:3000${path}`, { method: "POST", headers, body: JSON.stringify(body) })
}

function cookieValue(res: Response, name: string): string | null {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";")
    const idx = pair!.indexOf("=")
    if (pair!.slice(0, idx) === name) return decodeURIComponent(pair!.slice(idx + 1))
  }
  return null
}

test("start: 401 signed out, 403 for a client, 403 cross-origin, 404 when switched off", { skip }, async () => {
  const { POST } = await import("@/app/api/admin/view-as/route")
  process.env.VIEW_AS_ENABLED = "on"
  rawSession = null
  assert.equal((await POST(post("/api/admin/view-as", { slug: "legal_super" }))).status, 401)
  rawSession = { user: CLIENT }
  assert.equal((await POST(post("/api/admin/view-as", { slug: "legal_super" }))).status, 403)
  rawSession = { user: ADMIN }
  assert.equal((await POST(post("/api/admin/view-as", { slug: "legal_super" }, undefined, "https://evil.example"))).status, 403)
  process.env.VIEW_AS_ENABLED = "off"
  assert.equal((await POST(post("/api/admin/view-as", { slug: "legal_super" }))).status, 404)
  process.env.VIEW_AS_ENABLED = "on"
  assert.equal((await POST(post("/api/admin/view-as", { slug: "nope" }))).status, 404)
  assert.equal((await POST(post("/api/admin/view-as", { slug: "../x" }))).status, 400)
})

test("start: refuses with 503 and sets no cookie when the audit row cannot be written", { skip }, async () => {
  const { POST } = await import("@/app/api/admin/view-as/route")
  process.env.VIEW_AS_ENABLED = "on"
  rawSession = { user: ADMIN }
  auditFails = true
  try {
    const res = await POST(post("/api/admin/view-as", { slug: "legal_super", minutes: 30 }))
    assert.equal(res.status, 503)
    assert.equal(cookieValue(res, VIEW_AS_COOKIE), null)
  } finally {
    auditFails = false
  }
})

test("start: audits, signs a cookie bound to the admin, and redirects to the dashboard", { skip }, async () => {
  const { POST } = await import("@/app/api/admin/view-as/route")
  process.env.VIEW_AS_ENABLED = "on"
  rawSession = { user: ADMIN }
  audits.length = 0
  const res = await POST(post("/api/admin/view-as", { slug: "Legal_Super", minutes: 120 }, undefined, "http://localhost:3000"))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.redirect, "/dashboard/legal_super")
  assert.equal(body.clientName, "Legal Super")
  const token = cookieValue(res, VIEW_AS_COOKIE)
  const verified = await verifyViewAsToken(token, SECRET, Date.now())
  assert.equal(verified.ok, true)
  assert.equal(verified.ok && verified.payload.adminSub, ADMIN.sub)
  assert.equal(verified.ok && verified.payload.slug, "legal_super")
  assert.equal(verified.ok && verified.payload.exp - verified.payload.iat, 7200)
  assert.equal(cookieValue(res, VIEW_AS_HINT_COOKIE), "legal_super")
  const main = res.headers.getSetCookie().find((l) => l.startsWith(`${VIEW_AS_COOKIE}=`))!
  assert.match(main, /HttpOnly/i)
  assert.match(main, /Secure/i)
  assert.match(main, /SameSite=lax/i)
  assert.match(main, /Path=\//)
  assert.match(main, /Max-Age=7200/)
  assert.equal(audits.length, 1)
  assert.equal(audits[0]!.action, "start")
  assert.equal(audits[0]!.adminEmail, ADMIN.email)
  assert.equal(audits[0]!.clientSlug, "legal_super")
  assert.equal(audits[0]!.durationMinutes, 120)
})

async function liveToken(minutes: 30 | 60 = 60, nowMs = Date.now(), adminSub = ADMIN.sub) {
  return signViewAsPayload(
    buildViewAsPayload({ adminSub, slug: "legal_super", clientId: 16, clientName: "Legal Super", minutes, nowMs }),
    SECRET,
  )
}

test("exit: clears both cookies, audits exit while live and expire after it lapsed", { skip }, async () => {
  const { POST } = await import("@/app/api/view-as/exit/route")
  rawSession = { user: ADMIN }
  audits.length = 0
  const live = await POST(post("/api/view-as/exit", {}, `${VIEW_AS_COOKIE}=${await liveToken()}; ${VIEW_AS_HINT_COOKIE}=legal_super`))
  assert.equal((await live.json()).redirect, "/client/legal_super")
  assert.equal(cookieValue(live, VIEW_AS_COOKIE), "")
  assert.equal(cookieValue(live, VIEW_AS_HINT_COOKIE), "")
  assert.equal(audits.at(-1)!.action, "exit")

  const old = await liveToken(30, Date.now() - 31 * 60 * 1000)
  const lapsed = await POST(post("/api/view-as/exit", { reason: "expired" }, `${VIEW_AS_COOKIE}=${old}; ${VIEW_AS_HINT_COOKIE}=legal_super`))
  assert.equal((await lapsed.json()).action, "expire")
  assert.equal(audits.at(-1)!.action, "expire")
  assert.equal(audits.at(-1)!.clientSlug, "legal_super")

  const hintOnly = await POST(post("/api/view-as/exit", {}, `${VIEW_AS_HINT_COOKIE}=legal_super`))
  assert.equal((await hintOnly.json()).action, "expire")

  const before = audits.length
  const nothing = await POST(post("/api/view-as/exit", {}))
  assert.equal((await nothing.json()).redirect, "/client")
  assert.equal(audits.length, before)
})

test("exit: a non-admin still gets the cookies cleared and writes no audit", { skip }, async () => {
  const { POST } = await import("@/app/api/view-as/exit/route")
  rawSession = { user: CLIENT }
  const before = audits.length
  const res = await POST(post("/api/view-as/exit", {}, `${VIEW_AS_HINT_COOKIE}=legal_super`))
  assert.equal((await res.json()).redirect, "/")
  assert.equal(cookieValue(res, VIEW_AS_HINT_COOKIE), "")
  assert.equal(audits.length, before)
})

test("audit: blocked_write only for the admin the cookie is bound to", { skip }, async () => {
  const { POST } = await import("@/app/api/view-as/audit/route")
  rawSession = { user: ADMIN }
  audits.length = 0
  const ok = await POST(post("/api/view-as/audit", { path: "/api/creative-assets/upload", method: "post" }, `${VIEW_AS_COOKIE}=${await liveToken()}`))
  assert.equal(ok.status, 204)
  assert.deepEqual([audits.at(-1)!.action, audits.at(-1)!.path, audits.at(-1)!.method], ["blocked_write", "/api/creative-assets/upload", "POST"])
  const other = await POST(post("/api/view-as/audit", { path: "/x" }, `${VIEW_AS_COOKIE}=${await liveToken(60, Date.now(), "auth0|someone-else")}`))
  assert.equal(other.status, 204)
  rawSession = { user: CLIENT }
  await POST(post("/api/view-as/audit", { path: "/x" }, `${VIEW_AS_COOKIE}=${await liveToken()}`))
  assert.equal(audits.length, 1)
})
