/**
 * Security headers and the content security policy (S27). The one place that
 * builds them; `middleware.ts` applies them to every response it handles.
 *
 * - `security_headers` on: the baseline headers on every response, and the
 *   policy as `Content-Security-Policy-Report-Only` on every page.
 * - `csp_enforce` on as well: the same policy as `Content-Security-Policy`.
 *
 * Scripts use a per-request nonce with `'strict-dynamic'`. Every page renders
 * per request (the root layout reads the session), so a nonce costs no static
 * page. Next reads the nonce from the policy on the request headers and puts it
 * on its own scripts; `readNonce` hands it to the one inline script we add
 * (next-themes). Hashes can't work: Next streams per-request inline scripts.
 *
 * A new external origin the browser loads means a change here (INVARIANTS).
 * Docs: docs/brain/SECURITY-HEADERS.md.
 */
import { NextResponse, type NextRequest } from "next/server"

import { VERCEL_BLOB_API_URL } from "@/lib/config/endpoints"
import { featureEnvValue } from "@/lib/features/registry"
import { CSP_REPORT_PATH } from "@/lib/security/cspReport"

const CSP_REPORT_GROUP = "csp"

const CSP_HEADER = "Content-Security-Policy"
const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only"

/** Sent on every response while `security_headers` is on. */
export const BASELINE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // Two years, this host only: no includeSubDomains or preload until Luke
  // confirms every subdomain is HTTPS-only (notes B55, question 2).
  "Strict-Transport-Security": "max-age=63072000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // SAMEORIGIN, not DENY: the creative mockup frames /api/creative-assets/[id]/preview/.
  "X-Frame-Options": "SAMEORIGIN",
  // Only features the app never uses. Clipboard stays open (Expert grid paste reads it).
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
}

/** The policy for one page response. `reportUrl` is absolute (Reporting-Endpoints needs it). */
export function buildContentSecurityPolicy({ nonce, reportUrl, dev }: { nonce: string; reportUrl: string; dev: boolean }): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    // React dev tooling evals; production never gets 'unsafe-eval'.
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    // React style props, Recharts and next/font write inline styles.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Platform thumbnails (Meta, TikTok, CM360), client logos and Blob images come from many hosts.
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["media-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    // data: chart and Gantt PNG export fetches a canvas data URL. Blob API: creative uploads.
    ["connect-src", ["'self'", "data:", new URL(VERCEL_BLOB_API_URL).origin]],
    ["frame-src", ["'self'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
    ["report-uri", [reportUrl]],
    ["report-to", [CSP_REPORT_GROUP]],
  ]
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ")
}

/** The nonce the page's own inline scripts carry, from the policy middleware put on the request. */
export function readNonce(headers: Headers): string | undefined {
  const policy = headers.get(CSP_HEADER) ?? headers.get(CSP_REPORT_ONLY_HEADER) ?? ""
  return /'nonce-([^']+)'/.exec(policy)?.[1]
}

function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
}

/**
 * Adds the headers to `response` (returned, changed in place). `forwarded` is a
 * copy of the request headers taken before Auth0 ran, so a page sees exactly
 * the headers it saw before, plus the policy.
 */
export function applySecurityHeaders(
  request: NextRequest,
  forwarded: Headers,
  response: NextResponse,
  env: Record<string, string | undefined> = process.env,
): NextResponse {
  if (!featureEnvValue("security_headers", env)) return response
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) response.headers.set(name, value)

  // The policy goes on page renders only: redirects and JSON render nothing, and
  // API routes set their own (the creative preview sandboxes its zip).
  if (request.nextUrl.pathname.startsWith("/api") || response.headers.get("x-middleware-next") !== "1") return response

  const reportUrl = new URL(CSP_REPORT_PATH, request.url).href
  const policy = buildContentSecurityPolicy({ nonce: newNonce(), reportUrl, dev: env.NODE_ENV === "development" })
  const header = featureEnvValue("csp_enforce", env) ? CSP_HEADER : CSP_REPORT_ONLY_HEADER
  response.headers.set(header, policy)
  response.headers.set("Reporting-Endpoints", `${CSP_REPORT_GROUP}="${reportUrl}"`)

  // Next reads the nonce from the policy on the request. NextResponse.next({ request })
  // is the public way to set request headers; its override headers are copied onto
  // Auth0's response so its cookies and cache headers stay as they are.
  forwarded.set(header, policy)
  NextResponse.next({ request: { headers: forwarded } }).headers.forEach((value, name) => {
    if (name === "x-middleware-override-headers" || name.startsWith("x-middleware-request-")) response.headers.set(name, value)
  })
  return response
}
