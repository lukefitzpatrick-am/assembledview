import type {
  SearchAdCopy,
  SearchAdFormat,
  SearchAsset,
  SearchLimits,
} from "@/components/creative/searchads/types"
import { AVA_CREATIVE_VOICE } from "@/lib/ava/avaVoiceLine"

export type SearchCopyMode = "chat" | "no_brief"

function formatLabel(format: SearchAdFormat): string {
  return format === "rsa" ? "RSA" : "Performance Max"
}

function trimAssets(
  assets: SearchAsset[] | undefined,
  charLimit: number,
  maxCount: number,
): SearchAsset[] {
  if (!assets?.length) return []
  return assets
    .map((asset) => ({
      ...asset,
      text: asset.text.slice(0, charLimit),
    }))
    .filter((asset) => asset.text.trim().length > 0)
    .slice(0, maxCount)
}

export function buildSearchCopySystemPrompt(args: {
  format: "rsa" | "pmax"
  brandName: string
  clientName?: string
  campaignName?: string
  adGroup?: string
  keywords?: string
  finalUrl?: string
  complianceCategory?: "none" | "financial" | "alcohol" | "health"
  optionCountNote?: string
  mode: SearchCopyMode
  skillBody: string
  clientBrain?: string | null
  avContext?: string
  researchBrief?: string | null
  researchThin?: boolean
  limits: SearchLimits
}): string {
  const {
    format,
    brandName,
    clientName,
    campaignName,
    adGroup,
    keywords,
    finalUrl,
    complianceCategory,
    optionCountNote,
    mode,
    skillBody,
    limits,
  } = args

  const label = formatLabel(format)
  const brain = args.clientBrain?.trim()
  const av = args.avContext?.trim()

  const base = `${AVA_CREATIVE_VOICE} Writing Google ${label} search copy.

Brand/page: ${brandName}. Client: ${clientName ?? "n/a"}. Campaign: ${campaignName ?? "n/a"}.

Australian English. Sentence case. No em dashes. Brand must present as a distinctive
asset. Every asset must stand alone in any combination Google serves — never write
two-part headlines that only make sense together. Numbers do the talking.`

  const methodology = `Methodology (assembled-search-copy skill):
${skillBody.trim()}`

  const brainBlock = brain
    ? `Client marketing brain (HARD CONSTRAINTS — honour Tone and Compliance & never-say exactly):
${brain}`
    : `Client marketing brain is empty — write to the site/register with extra care.`

  const briefLines = [
    `Format: ${label}`,
    `Ad group: ${adGroup?.trim() || "n/a"}`,
    `Keywords: ${keywords?.trim() || "n/a"}`,
    `Final URL: ${finalUrl?.trim() || "n/a"}`,
    `Compliance category: ${complianceCategory ?? "none"}`,
    optionCountNote?.trim() ? `Asset count: ${optionCountNote.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const contextParts: string[] = []
  if (av) {
    contextParts.push(`AV context (from Assembled View):\n${av}`)
  }
  contextParts.push(`Ad-group brief:\n${briefLines}`)

  if (mode === "no_brief") {
    const research = args.researchBrief?.trim()
    const thinNote = args.researchThin
      ? "\nClient research was thin or unavailable — say so briefly in your reply and write from the site, AV context, and brain alone."
      : ""
    contextParts.push(
      research
        ? `Client research brief:\n${research}`
        : "No client research brief available.",
    )
    if (thinNote) contextParts.push(thinNote.trim())
  }

  const pmaxLimits =
    format === "pmax"
      ? `
- Long headlines ≤${limits.longHeadline} chars each (max ${limits.maxLongHeadlines})
- Business name ≤${limits.businessName} chars`
      : ""

  const hardLimits = `Hard limits (from MI library — do not exceed):
- Headlines ≤${limits.headline} chars each (up to ${limits.maxHeadlines}; RSA typically 15)
- Descriptions ≤${limits.description} chars each (RSA up to 4 / PMax up to ${limits.maxDescriptions})
- Display paths ≤${limits.path} chars each (2 paths)${pmaxLimits}

Most headlines should land under ~20 characters. Only pin for compliance. If pinning
legal/required text, pin to H1, H2, or D1 and provide 2–3 alternatives per pinned position.`

  const outputContract = `Always call the emit_search_copy tool. Return the full asset set with an \`angle\` tag and, where pinned for compliance, a \`pinned\` value per asset. Never invent offers, prices, or claims not supported by the brief, brain, creative context, or research.`

  return [
    base,
    methodology,
    brainBlock,
    contextParts.join("\n\n"),
    hardLimits,
    outputContract,
  ].join("\n\n")
}

export function trimSearchCopyToLimits(
  copy: SearchAdCopy,
  limits: SearchLimits,
): SearchAdCopy {
  const headlines = trimAssets(copy.headlines, limits.headline, limits.maxHeadlines)
  const descriptions = trimAssets(
    copy.descriptions,
    limits.description,
    limits.maxDescriptions,
  )
  const path1 = copy.path1.slice(0, limits.path)
  const path2 = copy.path2.slice(0, limits.path)

  const trimmed: SearchAdCopy = {
    format: copy.format,
    finalUrl: copy.finalUrl,
    path1,
    path2,
    headlines,
    descriptions,
  }

  if (copy.format === "pmax" || copy.longHeadlines || copy.businessName !== undefined) {
    trimmed.longHeadlines = trimAssets(
      copy.longHeadlines,
      limits.longHeadline,
      limits.maxLongHeadlines,
    )
    if (copy.businessName !== undefined) {
      trimmed.businessName = copy.businessName.slice(0, limits.businessName)
    }
  }

  if (copy.sitelinks) trimmed.sitelinks = copy.sitelinks
  if (copy.callouts) trimmed.callouts = copy.callouts

  return trimmed
}
