import { createHmac, timingSafeEqual } from "node:crypto"

const MAX_CLOCK_SKEW_SEC = 600

function getSigningSecret(): string | null {
  const secret = process.env.CREATIVE_FRAME_SIGNING_SECRET?.trim()
  return secret && secret.length >= 16 ? secret : null
}

export function signFrameToken(id: number, exp: number): string | null {
  const secret = getSigningSecret()
  if (!secret) return null
  return createHmac("sha256", secret).update(`${id}.${exp}`).digest("hex")
}

export function verifyFrameToken(id: number, exp: number, sig: string): boolean {
  const secret = getSigningSecret()
  if (!secret) return false

  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(exp) || exp < now) return false
  if (exp > now + MAX_CLOCK_SKEW_SEC) return false

  const expected = signFrameToken(id, exp)
  if (!expected) return false

  try {
    const a = Buffer.from(expected, "hex")
    const b = Buffer.from(sig, "hex")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function mintFrameUrl(args: {
  origin: string
  id: number
  ttlSec?: number
}): string | null {
  const exp = Math.floor(Date.now() / 1000) + (args.ttlSec ?? 300)
  const sig = signFrameToken(args.id, exp)
  if (!sig) return null
  const base = args.origin.replace(/\/$/, "")
  return `${base}/api/creative-assets/${args.id}/frame?exp=${exp}&sig=${encodeURIComponent(sig)}`
}

export function resolvePublicOrigin(request: Request): string {
  const envUrl = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envUrl) return envUrl.replace(/\/$/, "")

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const proto = request.headers.get("x-forwarded-proto") ?? "https"
  if (host) return `${proto}://${host}`
  return "http://localhost:3000"
}
