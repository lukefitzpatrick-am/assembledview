import { createHmac, timingSafeEqual } from "node:crypto"

import { resolvePublicOrigin as resolvePublicOriginFromConfig } from "@/lib/config/endpoints"

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

/** Prefer importing from `@/lib/config/endpoints`. Kept for live-mockup callers. */
export function resolvePublicOrigin(_request?: Request): string {
  return resolvePublicOriginFromConfig()
}
