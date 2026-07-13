import "server-only"
import { createHmac } from "node:crypto"

import type { LiveMockupProvider, LiveMockupRender } from "./provider"

const API_URL = "https://api.screenshotone.com/take"

function signQuery(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex")
}

function buildParams(req: LiveMockupRender, accessKey: string): URLSearchParams {
  const params = new URLSearchParams()
  params.set("access_key", accessKey)
  params.set("url", req.url)
  params.set("full_page", req.fullPage ? "true" : "false")
  params.set("format", "jpg")
  params.set("image_quality", "90")
  params.set("viewport_width", String(req.viewportWidth))
  params.set("ip_country_code", req.countryCode)
  params.set("block_cookie_banners", "true")
  // Keep ad slots — we inject into them. Never set block_ads=true.
  params.set("block_ads", "false")
  // Capture rendered HTML even when the host returns non-2xx (common on deep AU pages).
  params.set("ignore_host_errors", "true")
  params.set("wait_until", "networkidle2")
  params.set("delay", "3")
  if (req.injectScript) {
    params.set("scripts", req.injectScript)
    // Injected creative <img> may trigger loads after scripts run.
    params.set("scripts_wait_until", "networkidle2")
  }
  return params
}

export class ScreenshotOneProvider implements LiveMockupProvider {
  readonly name = "screenshotone"

  constructor(
    private readonly accessKey: string,
    private readonly secret?: string,
  ) {}

  async render(req: LiveMockupRender): Promise<{ image: Buffer; contentType: string }> {
    const params = buildParams(req, this.accessKey)
    let query = params.toString()

    if (this.secret) {
      const signature = signQuery(query, this.secret)
      query = `${query}&signature=${signature}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 55_000)

    try {
      const response = await fetch(`${API_URL}?${query}`, {
        method: "GET",
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => "")
        let providerMessage = text.trim()
        try {
          const parsed = JSON.parse(text) as { error_message?: string; message?: string }
          providerMessage =
            parsed.error_message?.trim() || parsed.message?.trim() || providerMessage
        } catch {
          // keep raw text
        }
        if (response.status === 401 || response.status === 403) {
          throw new ProviderError(
            "provider_blocked",
            providerMessage || "Screenshot provider rejected the request.",
          )
        }
        if (response.status === 408 || response.status === 504) {
          throw new ProviderError("provider_timeout", "Screenshot timed out — try again or use manual placement.")
        }
        throw new ProviderError(
          "provider_blocked",
          providerMessage || "Screenshot provider couldn't render this page.",
        )
      }

      const contentType = response.headers.get("content-type") ?? "image/jpeg"
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length < 100) {
        throw new ProviderError("provider_blocked", "Screenshot provider returned an empty image.")
      }
      return { image: buffer, contentType }
    } catch (error) {
      if (error instanceof ProviderError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("provider_timeout", "Screenshot timed out — try again or use manual placement.")
      }
      throw new ProviderError("provider_blocked", "Screenshot provider request failed.")
    } finally {
      clearTimeout(timer)
    }
  }
}

export class ProviderError extends Error {
  constructor(
    readonly code: "provider_blocked" | "provider_timeout" | "provider_not_configured",
    message: string,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

export function screenshotOneProvider(accessKey: string): LiveMockupProvider {
  const secret =
    process.env.SCREENSHOTONE_SECRET?.trim() ||
    process.env.SCREENSHOT_SECRET?.trim()
  return new ScreenshotOneProvider(accessKey, secret || undefined)
}
