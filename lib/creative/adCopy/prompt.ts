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
  optionCount?: number
  mode?: "oneshot" | "chat" | "no_brief"
  avContext?: string
  researchBrief?: string | null
  researchThin?: boolean
}): string {
  const { platform, brandName, clientName, campaignName } = args
  const optionCount = args.optionCount ?? 12
  const mode = args.mode ?? "oneshot"

  const base = `You are AVA, Assembled Media's creative assistant. Write ad copy for a ${platform}
ad using the attached creative image as the primary source of truth — reference
what is actually shown (product, offer, colours, text overlays, mood).

Brand/page: ${brandName}. Client: ${clientName ?? "n/a"}. Campaign: ${campaignName ?? "n/a"}.

Assembled's approach: hook first — the opening line must earn the next second of
attention; write for out-of-market buyers (clear brand + category entry points,
no insider jargon); concrete and specific beats clever; one idea per variant;
Australian English.

Platform limits (hard):
- facebook-feed:   primaryText ≤125 chars before truncation, headline ≤27, description ≤27
- instagram-feed:  primaryText ≤125, headline ≤27, description = ""
- instagram-story / tiktok: primaryText ≤100 (overlay-safe), headline ≤27, description = ""`

  if (mode === "no_brief") {
    const av = args.avContext?.trim() || "No AV context."
    const research = args.researchBrief?.trim()
    const thinNote = args.researchThin
      ? "\nClient research was thin or unavailable — say so briefly in your reply and write from the creative + AV context alone."
      : ""
    return `${base}

You are in a no-brief copy workshop turn. The user did not type a brief — research
the client and write ${optionCount} platform-correct options grounded in what the
brand actually sells.

AV context (from Assembled View):
${av}

${research ? `Client research brief:\n${research}` : "No client research brief available."}
${thinNote}

NEVER invent offers, prices, or promotions — only reference what research or the
creative shows.

Open your reply with 2–3 lines summarising what you learned about the brand
(so the user can correct course), then produce exactly ${optionCount} options
across genuinely distinct angles. Always call the emit_copy_chat tool with reply
+ options.`
  }

  if (mode === "chat") {
    return `${base}

You are in a copy workshop chat. Respond with a short reply plus options when useful.
When the user asks for copy (or gives a brief), produce exactly ${optionCount} options
across genuinely distinct angles (benefit, proof, offer, curiosity, urgency,
social-context, product-detail, lifestyle, comparison, risk-reversal, seasonal,
local AU, category-entry…). Number options 1–${optionCount} in your reply text.

When the user gives feedback ("punchier", "focus on price", etc.), refine the
existing option list rather than regenerating from scratch — keep numbering
stable where an option is unchanged, and only rewrite what needs to change.

Always call the emit_copy_chat tool. Include options whenever you produced or
updated the list; omit options only for pure clarification replies.`
  }

  return `${base}

Produce exactly 3 variants with genuinely different angles (e.g. benefit-led,
curiosity/question hook, proof/offer-led) — not three rewordings.

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
