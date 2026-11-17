/**
 * B55 (S27): POST /api/csp-report logs the violation without personal data,
 * echoes nothing, caps the body and rate limits per instance.
 */
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

let session: { user: Record<string, unknown> } | null = null

vi.mock("@/lib/auth0", () => ({
  auth0: { middleware: vi.fn(async () => undefined), getSession: vi.fn(async () => session) },
  auth0Raw: { middleware: vi.fn(async () => undefined), getSession: vi.fn(async () => session) },
}))

import { middleware } from "../../../../middleware"
import { POST } from "../route"
import { parseCspReports, takeCspReportSlot } from "@/lib/security/cspReport"
import { buildViewAsPayload, buildViewAsUser, VIEW_AS_COOKIE, VIEW_AS_HINT_COOKIE } from "@/lib/auth/viewAs"

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://av.example/api/csp-report", {
      method: "POST",
      body,
      headers: { "content-type": "application/csp-report", ...headers },
    }),
  )
}

const REPORT_URI = {
  "csp-report": {
    "document-uri": "https://av.example/dashboard/legal_super?token=secret#x",
    referrer: "https://av.example/dashboard?email=someone@example.com",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy": "default-src 'self'",
    disposition: "report",
    "blocked-uri": "https://evil.example/x.js?session=abc",
    "line-number": 12,
    "source-file": "https://av.example/_next/static/chunks/app.js?v=1",
    "script-sample": "alert('someone@example.com')",
  },
}

const REPORTING_API = [
  {
    type: "csp-violation",
    age: 10,
    url: "https://av.example/pacing?x=1",
    user_agent: "Mozilla/5.0",
    body: {
      documentURL: "https://av.example/pacing?x=1",
      effectiveDirective: "img-src",
      blockedURL: "data:image/png;base64,AAAA",
      disposition: "enforce",
      sample: "secret",
      lineNumber: 0,
    },
  },
  { type: "deprecation", body: { id: "x" } },
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  session = null
})

describe("parseCspReports", () => {
  it("keeps directive, blocked origin, page path, source path, line and disposition only", () => {
    expect(parseCspReports(REPORT_URI)).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example",
        page: "/dashboard/legal_super",
        source: "https://av.example/_next/static/chunks/app.js",
        line: 12,
        disposition: "report",
      },
    ])
  })

  it("reads the Reporting API shape and skips other report types", () => {
    expect(parseCspReports(REPORTING_API)).toEqual([
      { directive: "img-src", blocked: "data", page: "/pacing", source: null, line: null, disposition: "enforce" },
    ])
  })

  it("names inline and eval blocks by keyword; anything else is dropped", () => {
    expect(parseCspReports({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "inline" } })[0].blocked).toBe("inline")
    expect(parseCspReports({ "csp-report": { "effective-directive": "script-src", "blocked-uri": "<b>x</b>" } })[0].blocked).toBe("other")
    expect(parseCspReports({ "csp-report": { "effective-directive": "<script>" } })).toEqual([])
    expect(parseCspReports({ nope: 1 })).toEqual([])
    expect(parseCspReports("x")).toEqual([])
    expect(parseCspReports(null)).toEqual([])
  })

  it("reads at most 20 reports from one body", () => {
    const many = Array.from({ length: 50 }, () => REPORTING_API[0])
    expect(parseCspReports(many)).toHaveLength(20)
  })
})

describe("POST /api/csp-report", () => {
  it("logs each violation with no query, sample, referrer or user agent, and answers 204 with no body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await post(JSON.stringify(REPORT_URI))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = String(warn.mock.calls[0][1])
    for (const leak of ["secret", "someone@example.com", "session=abc", "Mozilla", "v=1", "alert"]) {
      expect(logged, leak).not.toContain(leak)
    }
  })

  it("400 for bad JSON or no violation, 413 for an oversized body", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect((await post("{not json")).status).toBe(400)
    expect((await post(JSON.stringify({ hello: "world" }))).status).toBe(400)
    expect((await post("x".repeat(70_000))).status).toBe(413)
    expect((await post("{}", { "content-length": "999999" })).status).toBe(413)
  })

  it("the slot limit is 120 a minute per instance", () => {
    const t = 10_000_000_000
    for (let i = 0; i < 120; i++) expect(takeCspReportSlot(t + i)).toBe(true)
    expect(takeCspReportSlot(t + 500)).toBe(false)
    expect(takeCspReportSlot(t + 60_000)).toBe(true)
  })

  it("answers 429 once the minute's slots are spent", async () => {
    const t = 20_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(t)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    for (let i = 0; i < 120; i++) takeCspReportSlot(t)
    expect((await post(JSON.stringify(REPORT_URI))).status).toBe(429)
  })
})

describe("middleware and the report path", () => {
  const ADMIN = { sub: "auth0|a", "https://assembledview.com/roles": ["admin"] }
  const VIEWING = `${VIEW_AS_COOKIE}=signed; ${VIEW_AS_HINT_COOKIE}=legal_super`
  const clientView = () =>
    buildViewAsUser(
      ADMIN,
      buildViewAsPayload({ adminSub: ADMIN.sub, slug: "legal_super", clientId: 16, clientName: "Legal Super", minutes: 60, nowMs: Date.now(), nonce: "n" }),
    )
  const send = (path: string, init: { method?: string; cookie?: string } = {}) =>
    middleware(
      new NextRequest(`https://av.example${path}`, {
        method: init.method ?? "POST",
        headers: init.cookie ? { cookie: init.cookie } : undefined,
      }),
    )

  it("security_headers on: lets a report through with no session or in a client view (browsers send reports without one)", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    for (const path of ["/api/csp-report", "/api/csp-report/"]) {
      const res = await send(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get("x-middleware-next")).toBe("1")
    }
    session = { user: clientView() }
    const viewing = await send("/api/csp-report", { cookie: VIEWING })
    expect(viewing.headers.get("x-middleware-next")).toBe("1")
  })

  it("security_headers on: only the exact path is open", async () => {
    vi.stubEnv("SECURITY_HEADERS", "on")
    for (const path of ["/api/csp-reportx", "/api/csp-report/x", "/api/csp-report-x"]) {
      for (const method of ["GET", "POST"]) {
        const res = await send(path, { method })
        expect(res.status, `${method} ${path}`).toBe(401)
        expect(await res.json()).toEqual({ error: "unauthorised" })
      }
    }
  })

  it("security_headers off: the path is gated like any API route (401 with no session, 403 in a client view)", async () => {
    for (const method of ["GET", "POST"]) {
      const res = await send("/api/csp-report", { method })
      expect(res.status, method).toBe(401)
      expect(await res.json()).toEqual({ error: "unauthorised" })
    }
    session = { user: clientView() }
    const viewing = await send("/api/csp-report", { cookie: VIEWING })
    expect(viewing.status).toBe(403)
    expect((await viewing.json()).error).toBe("read_only_view_as")
    // csp_enforce alone does not open it either.
    vi.stubEnv("CSP_ENFORCE", "on")
    session = null
    expect((await send("/api/csp-report")).status).toBe(401)
  })
})
