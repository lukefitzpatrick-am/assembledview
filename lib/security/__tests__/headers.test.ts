/**
 * B55 (S27): the baseline security headers and the report-only policy, through
 * middleware. Auth0 is mocked: no session unless a test sets one.
 */
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

let session: { user: Record<string, unknown> } | null = null

vi.mock("@/lib/auth0", () => ({
  auth0: { middleware: vi.fn(async () => undefined), getSession: vi.fn(async () => session) },
  auth0Raw: { middleware: vi.fn(async () => undefined), getSession: vi.fn(async () => session) },
}))

import { middleware } from "../../../middleware"
import { BASELINE_SECURITY_HEADERS, buildContentSecurityPolicy, readNonce } from "@/lib/security/headers"

const ADMIN = { sub: "auth0|a", "https://assembledview.com/roles": ["admin"] }
const RO = "content-security-policy-report-only"
const ENFORCED = "content-security-policy"

function req(path: string, init: { method?: string; cookie?: string } = {}) {
  return new NextRequest(`https://av.example${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: init.cookie } : undefined,
  })
}

function hasBaseline(res: Response) {
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) expect(res.headers.get(name), name).toBe(value)
}

afterEach(() => {
  vi.unstubAllEnvs()
  session = null
})

describe("the policy string", () => {
  it("is pinned: a new origin is a reviewed change", () => {
    expect(buildContentSecurityPolicy({ nonce: "abc", reportUrl: "https://av.example/api/csp-report", dev: false })).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "media-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' data: https://vercel.com",
        "frame-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
        "report-uri https://av.example/api/csp-report",
        "report-to csp",
      ].join("; "),
    )
  })

  it("the baseline is pinned: framing stays same-origin for the HTML5 preview iframe", () => {
    expect(BASELINE_SECURITY_HEADERS).toEqual({
      "Strict-Transport-Security": "max-age=63072000",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    })
  })

  it("adds 'unsafe-eval' in dev only", () => {
    const dev = buildContentSecurityPolicy({ nonce: "n", reportUrl: "https://x.example/r", dev: true })
    expect(dev).toContain("script-src 'self' 'nonce-n' 'strict-dynamic' 'unsafe-eval';")
  })

  it("readNonce reads either header and nothing else", () => {
    expect(readNonce(new Headers({ [RO]: "script-src 'nonce-Zm9v+/=' 'strict-dynamic'" }))).toBe("Zm9v+/=")
    expect(readNonce(new Headers({ [ENFORCED]: "script-src 'nonce-a1'" }))).toBe("a1")
    expect(readNonce(new Headers())).toBeUndefined()
  })
})

describe("middleware with security_headers off (the default)", () => {
  it("sends nothing new", async () => {
    session = { user: ADMIN }
    const res = await middleware(req("/dashboard"))
    expect(res.headers.get("x-middleware-next")).toBe("1")
    for (const name of [...Object.keys(BASELINE_SECURITY_HEADERS), RO, ENFORCED, "reporting-endpoints"]) {
      expect(res.headers.get(name), name).toBeNull()
    }
    expect(res.headers.get("x-middleware-override-headers")).toBeNull()
  })

  it("csp_enforce alone does nothing: it needs security_headers", async () => {
    vi.stubEnv("CSP_ENFORCE", "on")
    session = { user: ADMIN }
    const res = await middleware(req("/dashboard"))
    expect(res.headers.get(ENFORCED)).toBeNull()
    expect(res.headers.get("x-frame-options")).toBeNull()
  })
})

describe("middleware with security_headers on", () => {
  it("a page gets the baseline and the report-only policy, and the renderer gets the same policy", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    session = { user: ADMIN }
    const res = await middleware(req("/dashboard", { cookie: "appSession=abc" }))
    expect(res.headers.get("x-middleware-next")).toBe("1")
    hasBaseline(res)
    const policy = res.headers.get(RO)!
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}' 'strict-dynamic';/)
    expect(policy).toContain("report-uri https://av.example/api/csp-report")
    expect(res.headers.get(ENFORCED)).toBeNull()
    expect(res.headers.get("reporting-endpoints")).toBe('csp="https://av.example/api/csp-report"')
    expect(res.headers.get(`x-middleware-request-${RO}`)).toBe(policy)
    // Every original request header is still forwarded, the session cookie included.
    expect(res.headers.get("x-middleware-override-headers")!.split(",")).toEqual(expect.arrayContaining(["cookie", RO]))
    expect(res.headers.get("x-middleware-request-cookie")).toBe("appSession=abc")
  })

  it("each page render gets its own nonce", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    session = { user: ADMIN }
    const a = readNonce((await middleware(req("/dashboard"))).headers)
    const b = readNonce((await middleware(req("/dashboard"))).headers)
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })

  it("redirects and API responses get the baseline but no policy", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    const login = await middleware(req("/dashboard"))
    expect(login.status).toBe(307)
    hasBaseline(login)
    expect(login.headers.get(RO)).toBeNull()

    const api401 = await middleware(req("/api/clients"))
    expect(api401.status).toBe(401)
    hasBaseline(api401)
    expect(api401.headers.get(RO)).toBeNull()

    session = { user: ADMIN }
    const api = await middleware(req("/api/creative-assets/7/preview/"))
    expect(api.headers.get("x-middleware-next")).toBe("1")
    hasBaseline(api)
    expect(api.headers.get(RO)).toBeNull()
    expect(api.headers.get("x-middleware-override-headers")).toBeNull()
  })

  it("a policy the client sent never reaches the renderer: ours replaces it, in either mode", async () => {
    session = { user: ADMIN }
    const sent = { [ENFORCED]: "script-src 'nonce-sent1'", [RO]: "script-src 'nonce-sent2'" }
    vi.stubEnv("SECURITY_HEADERS", "on")
    for (const enforce of [false, true]) {
      if (enforce) vi.stubEnv("CSP_ENFORCE", "on")
      const res = await middleware(new NextRequest("https://av.example/dashboard", { headers: sent }))
      const ours = enforce ? ENFORCED : RO
      const other = enforce ? RO : ENFORCED
      const forwarded = res.headers.get("x-middleware-override-headers")!.split(",")
      expect(forwarded).toContain(ours)
      expect(forwarded).not.toContain(other)
      expect(res.headers.get(`x-middleware-request-${ours}`)).toBe(res.headers.get(ours))
      expect(res.headers.get(`x-middleware-request-${other}`)).toBeNull()
      expect(readNonce(res.headers)).not.toMatch(/^sent/)
    }
  })

  it("csp_enforce on moves the same policy to Content-Security-Policy", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    vi.stubEnv("CSP_ENFORCE", "on")
    session = { user: ADMIN }
    const res = await middleware(req("/dashboard"))
    expect(res.headers.get(RO)).toBeNull()
    expect(res.headers.get(ENFORCED)).toMatch(/^default-src 'self'; script-src 'self' 'nonce-/)
    expect(res.headers.get(`x-middleware-request-${ENFORCED}`)).toBe(res.headers.get(ENFORCED))
  })
})
