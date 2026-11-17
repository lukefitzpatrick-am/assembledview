/**
 * B55fix (R1): with security_headers on, Auth0's own response survives the
 * middleware unchanged. Real middleware, real Auth0Client (no mock of
 * lib/auth0), a session cookie from the SDK's `generateSessionCookie`, and a
 * faked OIDC provider (fetch answers discovery only). Dummy values throughout.
 *
 * The values Auth0 writes are encrypted with a fresh IV each time, so each case
 * captures Auth0's response as it left `auth0.middleware` and checks the final
 * response still carries those exact headers.
 */
import { NextRequest } from "next/server"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"

const ISSUER = "https://tenant.example/"
const SECRET = "dummy-secret-for-tests-only-0123456789abcdef"

const realFetch = vi.hoisted(() => {
  const saved = globalThis.fetch
  Object.assign(process.env, {
    AUTH0_DOMAIN: "tenant.example",
    AUTH0_CLIENT_ID: "dummy-client",
    AUTH0_CLIENT_SECRET: "dummy-client-secret",
    AUTH0_SECRET: "dummy-secret-for-tests-only-0123456789abcdef",
    APP_BASE_URL: "https://av.example",
    AUTH0_AUDIENCE: "https://api.example",
  })
  // The faked OIDC provider. Auth0Client keeps the fetch it sees when it is built.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === "https://tenant.example/.well-known/openid-configuration") {
      return Response.json({
        issuer: "https://tenant.example/",
        authorization_endpoint: "https://tenant.example/authorize",
        token_endpoint: "https://tenant.example/oauth/token",
        jwks_uri: "https://tenant.example/.well-known/jwks.json",
        end_session_endpoint: "https://tenant.example/oidc/logout",
      })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return saved
})

import { generateSessionCookie } from "@auth0/nextjs-auth0/testing"
import { auth0Raw } from "@/lib/auth0"
import { middleware } from "../../../middleware"

const ADMIN = { sub: "auth0|a", "https://assembledview.com/roles": ["admin"] }
const RO = "content-security-policy-report-only"
/** The headers Auth0 writes on the responses below. */
const AUTH0_HEADERS = ["cache-control", "pragma", "expires", "location"]

type Captured = { status: number; headers: Headers; setCookie: string[] }
let captured: Captured | null = null
const original = auth0Raw.middleware.bind(auth0Raw)
vi.spyOn(auth0Raw, "middleware").mockImplementation(async (request) => {
  const res = await original(request)
  captured = { status: res.status, headers: new Headers(res.headers), setCookie: res.headers.getSetCookie() }
  return res
})

async function sessionCookie(): Promise<string> {
  const value = await generateSessionCookie(
    {
      user: ADMIN,
      tokenSet: { accessToken: "at", idToken: "it", expiresAt: Math.floor(Date.now() / 1000) + 3600 },
      internal: { sid: "sid-1", createdAt: Math.floor(Date.now() / 1000) - 60 },
    },
    { secret: SECRET },
  )
  return `__session=${value}`
}

async function run(path: string, cookie?: string) {
  captured = null
  const res = await middleware(new NextRequest(`https://av.example${path}`, { headers: cookie ? { cookie } : undefined }))
  expect(captured, "auth0.middleware ran").not.toBeNull()
  return { res, auth0: captured! }
}

/**
 * Every header Auth0 wrote is on the final response, unchanged. Its cookies come
 * first (middleware may add the client view clears after them, on logout).
 */
function keepsAuth0(res: Response, auth0: Captured) {
  expect(res.status).toBe(auth0.status)
  for (const name of AUTH0_HEADERS) expect(res.headers.get(name), name).toBe(auth0.headers.get(name))
  expect(res.headers.getSetCookie().slice(0, auth0.setCookie.length)).toEqual(auth0.setCookie)
  const forwarded = auth0.headers.get("x-middleware-set-cookie")
  if (forwarded) expect(res.headers.get("x-middleware-set-cookie")!.startsWith(forwarded)).toBe(true)
}

const cookieNames = (res: Response) => res.headers.getSetCookie().map((c) => c.split("=")[0])

afterEach(() => vi.unstubAllEnvs())
afterAll(() => {
  globalThis.fetch = realFetch
})

describe("Auth0's response with security_headers on", () => {
  it("a page with a session: the rolled session cookie and Auth0's cache headers survive, and the policy is added", async () => {
    const cookie = await sessionCookie()
    const off = await run("/dashboard", cookie)
    vi.stubEnv("SECURITY_HEADERS", "on")
    const { res, auth0 } = await run("/dashboard", cookie)

    expect(auth0.setCookie.map((c) => c.split("=")[0])).toEqual(["__session"])
    expect(auth0.headers.get("cache-control")).toMatch(/no-store/)
    keepsAuth0(res, auth0)
    expect(res.headers.get("x-middleware-next")).toBe("1")
    expect(res.headers.get(RO)).toMatch(/'nonce-/)
    // Same shape as with the switch off.
    expect(cookieNames(res)).toEqual(cookieNames(off.res))
    expect(res.headers.get("cache-control")).toBe(off.res.headers.get("cache-control"))
  })

  it("an API call and a public page with a session keep the rolled cookie too", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    const cookie = await sessionCookie()
    for (const path of ["/api/me", "/privacy"]) {
      const { res, auth0 } = await run(path, cookie)
      expect(auth0.setCookie.length, path).toBe(1)
      keepsAuth0(res, auth0)
    }
  })

  it("login: the redirect location and the transaction cookie survive, and a redirect gets no policy", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    const { res, auth0 } = await run("/auth/login?returnTo=%2Fdashboard")
    expect(auth0.status).toBe(307)
    expect(auth0.headers.get("location")).toMatch(/^https:\/\/tenant\.example\/authorize\?/)
    expect(auth0.setCookie.some((c) => c.startsWith("__txn_"))).toBe(true)
    keepsAuth0(res, auth0)
    expect(res.headers.get(RO)).toBeNull()
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN")
  })

  it("logout: the end-session redirect and Auth0's cookie deletes survive; the client view cookies are still cleared after them", async () => {
    const cookie = await sessionCookie()
    const off = await run("/auth/logout", cookie)
    vi.stubEnv("SECURITY_HEADERS", "on")
    const { res, auth0 } = await run("/auth/logout", cookie)
    expect(auth0.status).toBe(307)
    expect(auth0.headers.get("location")).toMatch(new RegExp(`^${ISSUER}oidc/logout\\?`))
    keepsAuth0(res, auth0)
    expect(cookieNames(res)).toEqual(cookieNames(off.res))
    expect(cookieNames(res).length).toBeGreaterThan(auth0.setCookie.length)
  })
})
