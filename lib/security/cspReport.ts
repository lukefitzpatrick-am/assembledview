/**
 * CSP violation reports (S27). Parses both shapes browsers send to
 * /api/csp-report and keeps only what says which rule fired where:
 * no query strings, no script samples, no referrer, user agent or IP.
 *
 * - `report-uri`: `{ "csp-report": { "effective-directive", "blocked-uri", ... } }`
 * - `report-to` (Reporting API): `[{ type: "csp-violation", body: { effectiveDirective, blockedURL, ... } }]`
 */

/** Where browsers send reports. Middleware lets it through with no session. */
export const CSP_REPORT_PATH = "/api/csp-report"

export type CspViolation = {
  directive: string
  /** Origin of the blocked URL, or the keyword (inline, eval, data, blob). */
  blocked: string
  /** Path of the page that broke the rule, no query. */
  page: string
  /** Origin and path of the file that did it, when the browser says. */
  source: string | null
  line: number | null
  /** "report" while report-only, "enforce" once enforced. */
  disposition: "report" | "enforce" | null
}

const MAX_REPORTS = 20
const MAX_TEXT = 200

type Raw = Record<string, unknown>

function str(v: unknown): string {
  return typeof v === "string" ? v.slice(0, MAX_TEXT) : ""
}

function url(v: unknown): URL | null {
  try {
    return new URL(str(v))
  } catch {
    return null
  }
}

function blockedOf(v: unknown): string {
  const u = url(v)
  if (u && (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "wss:" || u.protocol === "ws:")) return u.origin
  if (u) return u.protocol.replace(/:$/, "")
  const keyword = str(v).toLowerCase()
  return /^[a-z-]{1,40}$/.test(keyword) ? keyword : "other"
}

function violation(r: Raw): CspViolation | null {
  const directive = str(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"]).split(" ")[0]
  if (!/^[a-z-]{1,40}$/.test(directive)) return null
  const source = url(r["source-file"] ?? r.sourceFile)
  const line = Number(r["line-number"] ?? r.lineNumber)
  const disposition = r.disposition === "report" || r.disposition === "enforce" ? r.disposition : null
  return {
    directive,
    blocked: blockedOf(r["blocked-uri"] ?? r.blockedURL),
    page: url(r["document-uri"] ?? r.documentURL)?.pathname ?? "unknown",
    source: source ? `${source.origin}${source.pathname}` : null,
    line: Number.isInteger(line) && line > 0 ? line : null,
    disposition,
  }
}

/** The violations in a parsed report body. Anything else is dropped. */
export function parseCspReports(body: unknown): CspViolation[] {
  const raws: Raw[] = []
  if (Array.isArray(body)) {
    for (const item of body.slice(0, MAX_REPORTS)) {
      if (item && typeof item === "object" && (item as Raw).type === "csp-violation" && (item as Raw).body && typeof (item as Raw).body === "object") {
        raws.push((item as Raw).body as Raw)
      }
    }
  } else if (body && typeof body === "object" && (body as Raw)["csp-report"] && typeof (body as Raw)["csp-report"] === "object") {
    raws.push((body as Raw)["csp-report"] as Raw)
  }
  return raws.map(violation).filter((v): v is CspViolation => v !== null)
}

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
let windowStart = 0
let used = 0

/**
 * One slot per report request: 120 a minute per server instance.
 * shortcut: per instance, not across instances; upgrade if report volume shows up in the Vercel log bill.
 */
export function takeCspReportSlot(now: number = Date.now()): boolean {
  if (now < windowStart || now - windowStart >= WINDOW_MS) {
    windowStart = now
    used = 0
  }
  if (used >= MAX_PER_WINDOW) return false
  used += 1
  return true
}
