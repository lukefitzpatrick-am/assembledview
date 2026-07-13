import { NextRequest, NextResponse } from "next/server"

import { buildInjectScript, supportsLiveInjection } from "@/lib/creative/liveMockup/injectScript"
import {
  mintFrameUrl,
  resolvePublicOrigin,
} from "@/lib/creative/liveMockup/frameSign"
import { getLiveMockupProvider } from "@/lib/creative/liveMockup/provider"
import { ProviderError } from "@/lib/creative/liveMockup/screenshotone"
import { checkLiveMockupRateLimit } from "@/lib/creative/liveMockup/rateLimit"
import {
  LiveMockupUrlError,
  validateLiveMockupTargetUrl,
} from "@/lib/creative/liveMockup/validateTargetUrl"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const HEADERS = {
  "Cache-Control": "private, no-store",
} as const

type Body = {
  url?: unknown
  mode?: unknown
  creative?: {
    id?: unknown
    mime_type?: unknown
    width_px?: unknown
    height_px?: unknown
    asset_name?: unknown
  }
}

type CreativePayload = {
  id: number
  mime_type: string
  width_px: number
  height_px: number
  asset_name: string
}

function parseCreative(raw: Body["creative"]): CreativePayload | null {
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

function urlErrorStatus(code: LiveMockupUrlError["code"]): number {
  switch (code) {
    case "invalid_url":
    case "https_required":
    case "private_ip":
      return 400
    case "dns_failed":
      return 502
    default:
      return 400
  }
}

/**
 * POST /api/creative-assets/live-mockup
 * Staff-only: capture a live page screenshot with optional creative slot injection.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkLiveMockupRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many live-page screenshots. Try again in a minute.",
      },
      { status: 429, headers: HEADERS },
    )
  }

  const provider = getLiveMockupProvider()
  if (!provider) {
    return NextResponse.json(
      {
        error: "provider_not_configured",
        message:
          "Live page screenshots aren't configured yet. Add SCREENSHOT_ACCESS or use built-in templates.",
      },
      { status: 503, headers: HEADERS },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Expected JSON body with a url." },
      { status: 400, headers: HEADERS },
    )
  }

  const url = typeof body.url === "string" ? body.url.trim() : ""
  if (!url) {
    return NextResponse.json(
      { error: "invalid_url", message: "A https URL is required." },
      { status: 400, headers: HEADERS },
    )
  }

  const mode = body.mode === "plain" ? "plain" : "inject"
  const creative = parseCreative(body.creative)

  try {
    await validateLiveMockupTargetUrl(url)
  } catch (error) {
    if (error instanceof LiveMockupUrlError) {
      return NextResponse.json(
        { error: error.code, message: friendlyUrlMessage(error.code) },
        { status: urlErrorStatus(error.code), headers: HEADERS },
      )
    }
    throw error
  }

  let injectScript: string | null = null
  let hint: string | undefined
  const publicOrigin = resolvePublicOrigin(request)
  const isLocalOrigin =
    /localhost|127\.0\.0\.1/i.test(publicOrigin) || publicOrigin.startsWith("http://192.")

  if (mode === "inject" && creative) {
    if (creative.mime_type === "application/zip") {
      hint = "HTML5 creatives: use manual placement on a plain screenshot."
    } else if (supportsLiveInjection(creative.mime_type)) {
      if (isLocalOrigin) {
        hint =
          "Creative injection needs a publicly reachable app URL — ScreenshotOne can't load localhost /frame links. Deploy or set APP_BASE_URL, or use manual placement."
      }
      const frameUrl = mintFrameUrl({
        origin: publicOrigin,
        id: creative.id,
      })
      if (!frameUrl) {
        return NextResponse.json(
          {
            error: "provider_not_configured",
            message: "CREATIVE_FRAME_SIGNING_SECRET is required for live mockups.",
          },
          { status: 503, headers: HEADERS },
        )
      }
      // Still inject on localhost so the empty-slot screenshot is useful for layout checks.
      injectScript = buildInjectScript(creative, frameUrl)
    }
  }

  const started = Date.now()
  try {
    const result = await provider.render({
      url,
      injectScript,
      fullPage: true,
      viewportWidth: 1440,
      countryCode: "au",
    })

    return NextResponse.json(
      {
        image: result.image.toString("base64"),
        contentType: result.contentType,
        provider: provider.name,
        tookMs: Date.now() - started,
        hint,
      },
      { status: 200, headers: HEADERS },
    )
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        {
          status: error.code === "provider_timeout" ? 504 : 502,
          headers: HEADERS,
        },
      )
    }
    console.error("[api/creative-assets/live-mockup]", error)
    return NextResponse.json(
      {
        error: "provider_blocked",
        message: "This page couldn't be captured. Try manual placement or a built-in template.",
      },
      { status: 502, headers: HEADERS },
    )
  }
}

function friendlyUrlMessage(code: LiveMockupUrlError["code"]): string {
  switch (code) {
    case "https_required":
      return "Only https URLs are supported."
    case "private_ip":
      return "That address can't be used for live mockups."
    case "dns_failed":
      return "Couldn't resolve that host. Check the URL."
    default:
      return "That doesn't look like a valid https URL."
  }
}
