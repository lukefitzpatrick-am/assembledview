import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { NextRequest } from "next/server"

import {
  buildViewAsPayload,
  buildViewAsUser,
  decideViewAsGate,
  isViewAsEnabled,
  isViewAsRequestAllowed,
  normaliseViewAsMinutes,
  normaliseViewAsSlug,
  readCookieFromRequestLike,
  readViewAsMarker,
  resolveViewAs,
  signViewAsPayload,
  verifyViewAsToken,
  viewAsClearCookies,
  VIEW_AS_COOKIE,
  VIEW_AS_HINT_COOKIE,
  VIEW_AS_WRITE_ALLOWLIST,
} from "@/lib/auth/viewAs"
import { withViewAsOverlay } from "@/lib/auth/viewAsAuth0"
import { resolveClientPageFence } from "@/lib/auth/clientPathFence"
import { decideClientAccess } from "@/lib/auth/assertClientAccess"
import { resolveClientMbaScope } from "@/lib/auth/checkClientMbaAccess"
import { isDashboardSlugAllowed } from "@/lib/auth/dashboardSlugAccess"
import { builderGate } from "@/lib/webReport/builder/access"
import {
  getUserClientSlugs,
  getUserMbaNumbers,
  getUserPrimaryMbaNumber,
  getUserRoles,
  userHasAdminAccess,
} from "@/lib/rbac"
import type { ClientGroup } from "@/lib/clients/clientGroup"

const SECRET = "s".repeat(48)
const ENV = { VIEW_AS_ENABLED: "on", VIEW_AS_SECRET: SECRET }
const NOW = Date.UTC(2026, 9, 29, 1, 0, 0)
const ADMIN_SUB = "auth0|admin-luke"
const ADMIN_EMAIL = "luke.fitzpatrick@assembledmedia.com.au"

function payload(overrides: Partial<Parameters<typeof buildViewAsPayload>[0]> = {}) {
  return buildViewAsPayload({
    adminSub: ADMIN_SUB,
    slug: "legal_super",
    clientId: 16,
    clientName: "Legal Super",
    minutes: 60,
    nowMs: NOW,
    nonce: "n1",
    ...overrides,
  })
}

async function token(overrides: Partial<Parameters<typeof buildViewAsPayload>[0]> = {}, secret = SECRET) {
  return signViewAsPayload(payload(overrides), secret)
}

function adminSession(user: Record<string, unknown>) {
  return { user: { sub: ADMIN_SUB, email: ADMIN_EMAIL, name: "Luke", ...user }, tokenSet: { idToken: "x" } }
}

/** Every place rbac.ts can find a role, all saying admin. */
const ADMIN_SHAPES: Array<[string, Record<string, unknown>]> = [
  ["namespaced .com roles", { "https://assembledview.com/roles": ["admin"] }],
  ["namespaced .com.au roles", { "https://assembledview.com.au/roles": ["admin"] }],
  ["namespaced singular role", { "https://assembledview.com/role": "admin" }],
  ["app_metadata.role", { app_metadata: { role: "admin" } }],
  ["app_metadata.roles", { app_metadata: { roles: ["admin", "client"] } }],
  ["user_metadata.role", { user_metadata: { role: "admin" } }],
  ["permissions only", { permissions: ["write:users", "delete:users"] }],
  [
    "everything at once, with real client claims",
    {
      "https://assembledview.com/roles": ["admin"],
      "https://assembledview.com/client_slugs": ["paul-hartmann-pty-ltd"],
      app_metadata: { role: "admin", mba_numbers: ["hartm001"], primary_mba_number: "hartm001", client_slug: "x" },
      user_metadata: { role: "admin", client_slug: "y" },
      permissions: ["write:users"],
    },
  ],
]

describe("view-as cookie sign and verify", () => {
  it("round-trips a signed payload", async () => {
    const result = await verifyViewAsToken(await token(), SECRET, NOW + 1000)
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.payload.slug, "legal_super")
    assert.equal(result.ok && result.payload.exp - result.payload.iat, 3600)
  })

  it("rejects a tampered body, a tampered signature and the wrong secret", async () => {
    const good = await token()
    const [body, sig] = good.split(".")
    const forged = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"))
    forged.slug = "paul-hartmann-pty-ltd"
    const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url")
    assert.deepEqual(await verifyViewAsToken(`${forgedBody}.${sig}`, SECRET, NOW), { ok: false, reason: "bad_signature" })
    const flipped = sig!.slice(0, -2) + (sig!.endsWith("AA") ? "BB" : "AA")
    assert.equal((await verifyViewAsToken(`${body}.${flipped}`, SECRET, NOW)).ok, false)
    assert.deepEqual(await verifyViewAsToken(good, "t".repeat(48), NOW), { ok: false, reason: "bad_signature" })
    assert.deepEqual(await verifyViewAsToken("not-a-token", SECRET, NOW), { ok: false, reason: "malformed" })
    assert.deepEqual(await verifyViewAsToken("", SECRET, NOW), { ok: false, reason: "malformed" })
  })

  it("rejects an expired cookie unless allowExpired (exit route only)", async () => {
    const t = await token({ minutes: 30 })
    assert.deepEqual(await verifyViewAsToken(t, SECRET, NOW + 30 * 60 * 1000), { ok: false, reason: "expired" })
    assert.equal((await verifyViewAsToken(t, SECRET, NOW + 30 * 60 * 1000 - 1)).ok, true)
    assert.equal((await verifyViewAsToken(t, SECRET, NOW + 31 * 60 * 1000, { allowExpired: true })).ok, true)
  })

  it("rejects a signed payload with an unsafe slug", async () => {
    const bad = { ...payload(), slug: "../finance" }
    assert.equal((await verifyViewAsToken(await signViewAsPayload(bad, SECRET), SECRET, NOW)).ok, false)
  })

  it("normalises minutes to 30, 60 or 120 (default 60) and slugs to tenant shape", () => {
    assert.equal(normaliseViewAsMinutes(30), 30)
    assert.equal(normaliseViewAsMinutes("120"), 120)
    assert.equal(normaliseViewAsMinutes(45), 60)
    assert.equal(normaliseViewAsMinutes(undefined), 60)
    assert.equal(normaliseViewAsSlug(" Legal_Super "), "legal_super")
    assert.equal(normaliseViewAsSlug("123"), "")
    assert.equal(normaliseViewAsSlug("a/b"), "")
    assert.equal(normaliseViewAsSlug(""), "")
  })
})

describe("view-as kill switch", () => {
  it("is off unless VIEW_AS_ENABLED is on/1/true and the secret is 32+ characters", () => {
    assert.equal(isViewAsEnabled({}), false)
    assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: "on" }), false)
    assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: "on", VIEW_AS_SECRET: "short" }), false)
    assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: "off", VIEW_AS_SECRET: SECRET }), false)
    for (const on of ["on", "1", "true", " TRUE "]) {
      assert.equal(isViewAsEnabled({ VIEW_AS_ENABLED: on, VIEW_AS_SECRET: SECRET }), true, on)
    }
  })
})

describe("view-as overlay user", () => {
  for (const [label, shape] of ADMIN_SHAPES) {
    it(`getUserRoles(overlay) is exactly ["client"]: ${label}`, async () => {
      const raw = adminSession(shape)
      assert.equal(userHasAdminAccess(raw.user as never), true, "fixture must be an admin")
      const resolved = await resolveViewAs(raw, await token(), { env: ENV, nowMs: NOW })
      assert.equal(resolved.status, "active")
      const user = resolved.session!.user as Record<string, unknown>
      assert.deepEqual(getUserRoles(user as never), ["client"])
      assert.equal(userHasAdminAccess(user as never), false)
      assert.deepEqual(getUserClientSlugs(user as never), ["legal_super"])
      assert.deepEqual(getUserMbaNumbers(user as never), [])
      assert.equal(getUserPrimaryMbaNumber(user as never), null)
      assert.equal("permissions" in user, false)
      assert.equal("user_metadata" in user, false)
      assert.deepEqual(user.app_metadata, { client_slug: "legal_super", client_slugs: ["legal_super"] })
      assert.equal(user.email, "view-as+legal_super@assembledview.invalid")
      assert.equal(user.sub, ADMIN_SUB)
      assert.equal(user.name, "Legal Super")
      // The raw session object is not mutated.
      assert.equal(raw.user.email, ADMIN_EMAIL)
    })
  }

  it("is a fresh object: only the allowlisted keys", () => {
    const user = buildViewAsUser({ sub: ADMIN_SUB }, payload())
    assert.deepEqual(Object.keys(user).sort(), [
      "__viewAs",
      "app_metadata",
      "email",
      "email_verified",
      "https://assembledview.com/client_slug",
      "https://assembledview.com/client_slugs",
      "https://assembledview.com/roles",
      "name",
      "sub",
    ])
    assert.deepEqual(readViewAsMarker(user), {
      adminSub: ADMIN_SUB,
      slug: "legal_super",
      clientId: 16,
      clientName: "Legal Super",
      startedAt: Math.floor(NOW / 1000),
      exp: Math.floor(NOW / 1000) + 3600,
    })
    assert.equal(readViewAsMarker({ sub: "x", email: "a@b" }), null)
    assert.equal(readViewAsMarker(null), null)
  })
})

describe("view-as overlay conditions", () => {
  it("no cookie is the raw session, untouched", async () => {
    const raw = adminSession({ "https://assembledview.com/roles": ["admin"] })
    const resolved = await resolveViewAs(raw, null, { env: ENV, nowMs: NOW })
    assert.equal(resolved.status, "absent")
    assert.equal(resolved.session, raw)
  })

  it("switched off: raw session", async () => {
    const raw = adminSession({ "https://assembledview.com/roles": ["admin"] })
    const resolved = await resolveViewAs(raw, await token(), { env: { VIEW_AS_SECRET: SECRET }, nowMs: NOW })
    assert.deepEqual([resolved.status, resolved.reason], ["ignored", "disabled"])
    assert.deepEqual(getUserRoles(resolved.session!.user as never), ["admin"])
  })

  it("tampered or expired cookie: raw session", async () => {
    const raw = adminSession({ "https://assembledview.com/roles": ["admin"] })
    const t = await token()
    const tampered = await resolveViewAs(raw, t.slice(0, -3) + "abc", { env: ENV, nowMs: NOW })
    assert.equal(tampered.status, "ignored")
    assert.equal(tampered.session, raw)
    const expired = await resolveViewAs(raw, t, { env: ENV, nowMs: NOW + 61 * 60 * 1000 })
    assert.deepEqual([expired.status, expired.reason], ["ignored", "expired"])
    assert.equal(expired.session, raw)
  })

  it("a non-admin real session is ignored, even with a valid cookie for its own sub", async () => {
    const client = {
      user: {
        sub: "auth0|client-1",
        email: "meg@legalsuper.com.au",
        "https://assembledview.com/roles": ["client"],
        "https://assembledview.com/client_slugs": ["legal_super"],
      },
    }
    const t = await token({ adminSub: "auth0|client-1", slug: "paul-hartmann-pty-ltd" })
    const resolved = await resolveViewAs(client, t, { env: ENV, nowMs: NOW })
    assert.deepEqual([resolved.status, resolved.reason], ["ignored", "not_admin"])
    assert.deepEqual(getUserClientSlugs(resolved.session.user as never), ["legal_super"])
    const noRole = { user: { sub: "auth0|x", "https://assembledview.com/roles": ["manager"] } }
    assert.equal((await resolveViewAs(noRole, await token({ adminSub: "auth0|x" }), { env: ENV, nowMs: NOW })).status, "ignored")
  })

  it("another admin's cookie is ignored (bound to adminSub)", async () => {
    const other = { user: { sub: "auth0|admin-gareth", "https://assembledview.com/roles": ["admin"] } }
    const resolved = await resolveViewAs(other, await token(), { env: ENV, nowMs: NOW })
    assert.deepEqual([resolved.status, resolved.reason], ["ignored", "wrong_admin"])
  })

  it("no session stays null", async () => {
    const resolved = await resolveViewAs(null, await token(), { env: ENV, nowMs: NOW })
    assert.equal(resolved.session, null)
  })
})

describe("existing guards with an overlay user", () => {
  async function overlayUser() {
    const raw = adminSession({ "https://assembledview.com/roles": ["admin"], permissions: ["write:users"] })
    return (await resolveViewAs(raw, await token(), { env: ENV, nowMs: NOW })).session!.user
  }

  it("page fence: own dashboard only; /client, /admin, /finance redirect to the client dashboard", async () => {
    const slugs = getUserClientSlugs((await overlayUser()) as never)
    assert.deepEqual(resolveClientPageFence("/dashboard/legal_super", slugs), { redirectTarget: null, reason: null })
    assert.deepEqual(resolveClientPageFence("/dashboard/legal_super/web", slugs), { redirectTarget: null, reason: null })
    for (const path of ["/client/legal_super", "/client", "/admin/web-reports", "/finance", "/finance/invoicing", "/mediaplans", "/pacing"]) {
      assert.equal(resolveClientPageFence(path, slugs).redirectTarget, "/dashboard/legal_super", path)
    }
    assert.equal(
      resolveClientPageFence("/dashboard/paul-hartmann-pty-ltd", slugs).reason,
      "client-cross-tenant-block",
    )
    assert.equal(resolveClientPageFence("/view-as/ended", slugs).redirectTarget, null)
    assert.equal(resolveClientPageFence("/view-as/start", slugs).redirectTarget, null)
  })

  it("dashboard slug check, builder gate and client access decide as a client", async () => {
    const user = await overlayUser()
    const roles = getUserRoles(user as never)
    const tenantSlugs = getUserClientSlugs(user as never)
    assert.equal(isDashboardSlugAllowed({ roles, tenantSlugs, slug: "legal_super" }), true)
    assert.equal(isDashboardSlugAllowed({ roles, tenantSlugs, slug: "paul-hartmann-pty-ltd" }), false)
    assert.equal(builderGate(user as never), "not_found")
    const base = { hasSession: true, isAdmin: roles.includes("admin"), isClient: roles.includes("client") }
    assert.deepEqual(decideClientAccess({ ...base, requestedClientId: 16, callerClientIds: new Set([16]) }), {
      ok: true,
      isClient: true,
    })
    assert.equal(decideClientAccess({ ...base, requestedClientId: 12, callerClientIds: new Set([16]) }).ok, false)
  })

  it("MBA scope falls back to the client's mbaidentifier (no mba_numbers)", async () => {
    const user = await overlayUser()
    const group: ClientGroup = { anchor: { id: 16 }, members: [{ id: 16 }], mbaidentifier: "legsu", nameSlugs: new Set() }
    const scope = await resolveClientMbaScope(new NextRequest("http://localhost/api/x"), {
      getSession: async () => ({ user }),
      fetchClientGroupByUrlSlug: async (slug) => (slug === "legal_super" ? group : null),
    })
    assert.equal(scope.ok, true)
    if (!scope.ok) return
    assert.equal(scope.isClient, true)
    assert.equal(scope.denyPath, "identifier")
    assert.equal(scope.allows("legsu001"), true)
    assert.equal(scope.allows("hartm001"), false)
  })
})

describe("read-only gate", () => {
  const active = { viewAsActive: true, viewAsCookiePresent: true, hintPresent: true, rawIsAdmin: false }

  it("blocks POST, PUT, PATCH and DELETE on APIs and non-GET pages", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.deepEqual(
        decideViewAsGate({ ...active, method, pathname: "/api/creative-assets/upload", isApi: true }),
        { kind: "block_write" },
        method,
      )
      assert.deepEqual(
        decideViewAsGate({ ...active, method, pathname: "/dashboard/legal_super", isApi: false }),
        { kind: "block_write" },
      )
    }
    assert.equal(decideViewAsGate({ ...active, method: "POST", pathname: "/api/admin/view-as", isApi: true }).kind, "block_write")
    assert.equal(decideViewAsGate({ ...active, method: "POST", pathname: "/api/kpis/client", isApi: true }).kind, "block_write")
  })

  it("lets reads and the POST-as-read allowlist through", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      assert.equal(decideViewAsGate({ ...active, method, pathname: "/api/mediaplans/mba/x", isApi: true }).kind, "pass")
    }
    assert.deepEqual([...VIEW_AS_WRITE_ALLOWLIST], [
      "/api/view-as/exit",
      "/api/view-as/audit",
      "/api/pacing/bulk",
      "/api/pacing/conversions",
    ])
    for (const pathname of VIEW_AS_WRITE_ALLOWLIST) {
      assert.equal(decideViewAsGate({ ...active, method: "POST", pathname, isApi: true }).kind, "pass", pathname)
    }
    assert.equal(isViewAsRequestAllowed("POST", "/api/pacing/bulk/extra", true), false)
    assert.equal(isViewAsRequestAllowed("POST", "/api/pacing/bulk", false), false)
  })

  it("ended: a lapsed cookie or hint on a raw admin sends pages to /view-as/ended and APIs 409", () => {
    const ended = { viewAsActive: false, viewAsCookiePresent: false, hintPresent: true, rawIsAdmin: true }
    assert.deepEqual(decideViewAsGate({ ...ended, method: "GET", pathname: "/dashboard/legal_super", isApi: false }), { kind: "ended" })
    assert.deepEqual(decideViewAsGate({ ...ended, method: "GET", pathname: "/api/pacing/bulk", isApi: true }), { kind: "ended" })
    assert.equal(decideViewAsGate({ ...ended, method: "GET", pathname: "/view-as/ended", isApi: false }).kind, "pass")
    assert.equal(decideViewAsGate({ ...ended, method: "GET", pathname: "/view-as/start", isApi: false }).kind, "pass")
    for (const pathname of ["/api/view-as/exit", "/api/admin/view-as", "/api/view-as/audit"]) {
      assert.equal(decideViewAsGate({ ...ended, method: "POST", pathname, isApi: true }).kind, "pass", pathname)
    }
    const tamperedCookieOnly = { ...ended, viewAsCookiePresent: true, hintPresent: false }
    assert.equal(decideViewAsGate({ ...tamperedCookieOnly, method: "GET", pathname: "/client", isApi: false }).kind, "ended")
  })

  it("ignores stray cookies on a non-admin session and passes with no cookies", () => {
    const client = { viewAsActive: false, viewAsCookiePresent: true, hintPresent: true, rawIsAdmin: false }
    assert.equal(decideViewAsGate({ ...client, method: "POST", pathname: "/api/creative-assets/upload", isApi: true }).kind, "pass")
    const none = { viewAsActive: false, viewAsCookiePresent: false, hintPresent: false, rawIsAdmin: true }
    assert.equal(decideViewAsGate({ ...none, method: "POST", pathname: "/api/kpis/client", isApi: true }).kind, "pass")
  })

  it("clears both cookies with Secure and Path=/ (needed for __Host-)", () => {
    const cleared = viewAsClearCookies()
    assert.deepEqual(cleared.map((c) => c.name), [VIEW_AS_COOKIE, VIEW_AS_HINT_COOKIE])
    for (const c of cleared) {
      assert.equal(c.options.maxAge, 0)
      assert.equal(c.options.secure, true)
      assert.equal(c.options.path, "/")
      assert.equal(c.options.httpOnly, true)
    }
  })
})

describe("getSession facade", () => {
  function fakeAuth0(session: unknown) {
    const calls: unknown[][] = []
    const raw = {
      secretField: 41,
      async getSession(...args: unknown[]) {
        calls.push(args)
        return session
      },
      middleware(this: { secretField: number }) {
        return this.secretField + 1
      },
    }
    return { raw, calls }
  }

  it("applies the overlay from the request cookie and keeps other members bound", async () => {
    const t = await token()
    const { raw, calls } = fakeAuth0(adminSession({ "https://assembledview.com/roles": ["admin"] }))
    const auth0 = withViewAsOverlay(raw, { env: () => ENV, now: () => NOW })
    const req = new NextRequest("http://localhost/dashboard/legal_super", {
      headers: { cookie: `${VIEW_AS_COOKIE}=${t}; other=1` },
    })
    const session = (await auth0.getSession(req)) as { user: Record<string, unknown> }
    assert.deepEqual(getUserRoles(session.user as never), ["client"])
    assert.equal(calls[0]![0], req)
    assert.equal(auth0.middleware(), 42)
  })

  it("no cookie, or a cookie read that throws, returns the raw session object", async () => {
    const rawSession = adminSession({ "https://assembledview.com/roles": ["admin"] })
    const { raw } = fakeAuth0(rawSession)
    const plain = withViewAsOverlay(raw, { env: () => ENV, now: () => NOW, readToken: async () => null })
    assert.equal(await plain.getSession(), rawSession)
    const throwing = withViewAsOverlay(raw, {
      env: () => ENV,
      now: () => NOW,
      readToken: async () => {
        throw new Error("cookies() outside a request")
      },
    })
    assert.equal(await throwing.getSession(), rawSession)
  })

  it("reads the cookie from NextRequest, a cookie header and a pages-router cookie record", () => {
    const req = new NextRequest("http://localhost/x", { headers: { cookie: `${VIEW_AS_COOKIE}=abc.def` } })
    assert.equal(readCookieFromRequestLike(req, VIEW_AS_COOKIE), "abc.def")
    assert.equal(readCookieFromRequestLike({ headers: { cookie: `a=1; ${VIEW_AS_COOKIE}=xyz` } }, VIEW_AS_COOKIE), "xyz")
    assert.equal(readCookieFromRequestLike({ cookies: { [VIEW_AS_COOKIE]: "rec" } }, VIEW_AS_COOKIE), "rec")
    assert.equal(readCookieFromRequestLike({ headers: { cookie: "a=1" } }, VIEW_AS_COOKIE), null)
    assert.equal(readCookieFromRequestLike(undefined, VIEW_AS_COOKIE), undefined)
  })
})
