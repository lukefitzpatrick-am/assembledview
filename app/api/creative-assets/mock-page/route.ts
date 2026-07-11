import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import {
  fetchHtmlSafe,
  MockPageFetchError,
  checkMockPageRateLimit,
  rewriteMockPage,
  summarizeSlots,
  type CreativeInject,
} from "@/lib/creative/mockPage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 15

const SHELL_HEADERS = {
  "Content-Security-Policy": "sandbox",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
} as const

type Body = {
  url?: unknown
  creative?: {
    id?: unknown
    mime_type?: unknown
    width_px?: unknown
    height_px?: unknown
    asset_name?: unknown
  }
}

function parseCreative(raw: Body["creative"]): CreativeInject | null {
  if (!raw || typeof raw !== "object") return null
  const id = Number(raw.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const mime_type = String(raw.mime_type ?? "").trim()
  if (!mime_type) return null
  const width_px = Number(raw.width_px)
  const height_px = Number(raw.height_px)
  if (!Number.isFinite(width_px) || !Number.isFinite(height_px)) return null
  return {
    id,
    mime_type,
    width_px,
    height_px,
    asset_name: String(raw.asset_name ?? "Creative").trim() || "Creative",
  }
}

function fetchErrorStatus(code: MockPageFetchError["code"]): number {
  switch (code) {
    case "invalid_url":
    case "https_required":
    case "not_html":
      return 400
    case "private_ip":
      return 400
    case "timeout":
      return 504
    case "too_large":
      return 413
    case "redirect_limit":
    case "dns_failed":
    case "fetch_failed":
      return 502
    default:
      return 502
  }
}

/**
 * POST /api/creative-assets/mock-page
 * Staff-only: fetch a live URL, strip scripts, detect ad slots, inject matching creative.
 * Returns rewritten HTML (scriptless shell) + slot summary. CSP: sandbox (no allow-scripts).
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub ||
    gate.session?.user?.email ||
    "anonymous"
  const limit = checkMockPageRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many live-page fetches. Try again in a minute." },
      { status: 429, headers: SHELL_HEADERS },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body with a url." },
      { status: 400, headers: SHELL_HEADERS },
    )
  }

  const url = typeof body.url === "string" ? body.url.trim() : ""
  if (!url) {
    return NextResponse.json(
      { error: "invalid_url", message: "A https URL is required." },
      { status: 400, headers: SHELL_HEADERS },
    )
  }

  const creative = parseCreative(body.creative)

  try {
    const { html: rawHtml, finalUrl } = await fetchHtmlSafe(url)
    const { html, slots } = rewriteMockPage(rawHtml, finalUrl, creative)
    const summary = summarizeSlots(slots, creative)

    return NextResponse.json(
      {
        html,
        finalUrl,
        slots,
        summary,
      },
      { status: 200, headers: SHELL_HEADERS },
    )
  } catch (err) {
    if (err instanceof MockPageFetchError) {
      return NextResponse.json(
        {
          error: err.code,
          message: friendlyMessage(err),
        },
        { status: fetchErrorStatus(err.code), headers: SHELL_HEADERS },
      )
    }
    console.error("[api/creative-assets/mock-page]", err)
    return NextResponse.json(
      {
        error: "fetch_failed",
        message:
          "This page couldn’t be loaded for mockup. Try a built-in template instead.",
      },
      { status: 502, headers: SHELL_HEADERS },
    )
  }
}

function friendlyMessage(err: MockPageFetchError): string {
  switch (err.code) {
    case "https_required":
      return "Only https URLs are supported. Paste an https link, or use a built-in template."
    case "private_ip":
      return "That address can’t be used for live mockups. Try a public https page, or a built-in template."
    case "timeout":
      return "The page took too long to respond. Try again, or use a built-in template."
    case "too_large":
      return "That page is too large to preview. Try a built-in template."
    case "not_html":
      return "That URL didn’t return an HTML page. Try a news article URL, or a built-in template."
    case "dns_failed":
      return "Couldn’t resolve that host. Check the URL, or use a built-in template."
    case "redirect_limit":
      return "Too many redirects while fetching the page. Try a built-in template."
    case "invalid_url":
      return "That doesn’t look like a valid https URL."
    default:
      return "This page couldn’t be loaded for mockup (blocked, paywalled, or unavailable). Try a built-in template."
  }
}
