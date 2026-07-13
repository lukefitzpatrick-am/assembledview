import type { SocialCtaLabel } from "@/components/creative/mockups/social/types"

export type AdCopyPlatform =
  | "facebook-feed"
  | "instagram-feed"
  | "instagram-story"
  | "tiktok"

export type AdCopyVariant = {
  angle: string
  primaryText: string
  headline: string
  description: string
  cta: SocialCtaLabel
}

export const PLATFORM_LIMITS: Record<
  AdCopyPlatform,
  { primaryText: number; headline: number; description: number }
> = {
  "facebook-feed": { primaryText: 125, headline: 27, description: 27 },
  "instagram-feed": { primaryText: 125, headline: 27, description: 0 },
  "instagram-story": { primaryText: 100, headline: 27, description: 0 },
  tiktok: { primaryText: 100, headline: 27, description: 0 },
}

export function buildAdCopySystemPrompt(args: {
  platform: AdCopyPlatform
  brandName: string
  clientName?: string
  campaignName?: string
}): string {
  const { platform, brandName, clientName, campaignName } = args
  return `You are AVA, Assembled Media's creative assistant. Write ad copy for a ${platform}
ad using the attached creative image as the primary source of truth — reference
what is actually shown (product, offer, colours, text overlays, mood).

Brand/page: ${brandName}. Client: ${clientName ?? "n/a"}. Campaign: ${campaignName ?? "n/a"}.

Assembled's approach: hook first — the opening line must earn the next second of
attention; write for out-of-market buyers (clear brand + category entry points,
no insider jargon); concrete and specific beats clever; one idea per variant;
Australian English.

Produce exactly 3 variants with genuinely different angles (e.g. benefit-led,
curiosity/question hook, proof/offer-led) — not three rewordings.

Platform limits (hard):
- facebook-feed:   primaryText ≤125 chars before truncation, headline ≤27, description ≤27
- instagram-feed:  primaryText ≤125, headline ≤27, description = ""
- instagram-story / tiktok: primaryText ≤100 (overlay-safe), headline ≤27, description = ""

If existing copy is provided, diverge from it — do not lightly rephrase it.`
}

export function trimVariantToLimits(
  platform: AdCopyPlatform,
  variant: AdCopyVariant,
): AdCopyVariant {
  const lim = PLATFORM_LIMITS[platform]
  return {
    angle: variant.angle.trim(),
    primaryText: variant.primaryText.slice(0, lim.primaryText),
    headline: variant.headline.slice(0, lim.headline),
    description:
      lim.description === 0 ? "" : variant.description.slice(0, lim.description),
    cta: variant.cta,
  }
}
