import type { BillingLineItem } from "@/lib/types/financeBilling"

export type FinanceLineItemForDescription = BillingLineItem & {
  network?: string | null
  platform?: string | null
  publisher?: string | null
  site?: string | null
  station?: string | null
  placement?: string | null
  market?: string | null
  title?: string | null
  ad_size?: string | null
  format?: string | null
  bid_strategy?: string | null
  creative?: string | null
}

export type ChannelKey =
  | "television"
  | "radio"
  | "newspapers"
  | "magazines"
  | "ooh"
  | "cinema"
  | "digital_display"
  | "digital_audio"
  | "digital_video"
  | "bvod"
  | "search"
  | "social"
  | "prog_display"
  | "prog_audio"
  | "prog_video"
  | "prog_ooh"
  | "fees"
  | "retainer"
  | "unknown"

function trimPart(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t.length > 0 ? t : null
}

function firstNonEmpty(
  ...vals: (string | null | undefined)[]
): string | null {
  for (const v of vals) {
    const t = trimPart(v)
    if (t) return t
  }
  return null
}

function joinDescriptionParts(parts: (string | null | undefined)[]): string {
  return parts
    .map(trimPart)
    .filter((p): p is string => Boolean(p))
    .join(" · ")
}

function normalizeDetectionSource(li: FinanceLineItemForDescription): string {
  const raw = li.media_type || li.line_type || ""
  return String(raw).toLowerCase().replace(/\s+/g, " ").trim()
}

function hasWholeWord(haystack: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack)
}

function detectChannelFromNormalizedString(n: string): ChannelKey {
  if (!n) return "unknown"

  if (n.includes("out of home")) return "ooh"

  if (n.includes("programmatic display")) return "prog_display"
  if (n.includes("programmatic audio")) return "prog_audio"
  if (n.includes("programmatic video")) return "prog_video"
  if (n.includes("programmatic ooh")) return "prog_ooh"

  if (n.includes("digital display")) return "digital_display"
  if (n.includes("digital audio")) return "digital_audio"
  if (n.includes("digital video")) return "digital_video"

  if (n.includes("google ads")) return "search"
  if (n.includes("social media")) return "social"

  if (n.includes("prog display")) return "prog_display"
  if (n.includes("prog audio")) return "prog_audio"
  if (n.includes("prog video")) return "prog_video"
  if (n.includes("prog ooh")) return "prog_ooh"

  if (n.includes("newspapers") || n.includes("newspaper") || hasWholeWord(n, "press"))
    return "newspapers"
  if (n.includes("magazines") || n.includes("magazine")) return "magazines"

  if (hasWholeWord(n, "cinema")) return "cinema"
  if (hasWholeWord(n, "bvod")) return "bvod"

  if (hasWholeWord(n, "search") || hasWholeWord(n, "sem")) return "search"
  if (
    hasWholeWord(n, "social") ||
    hasWholeWord(n, "meta") ||
    hasWholeWord(n, "tiktok")
  )
    return "social"

  if (n.includes("television") || hasWholeWord(n, "tv")) return "television"
  if (hasWholeWord(n, "radio")) return "radio"

  if (hasWholeWord(n, "ooh") || n.includes("outdoor")) return "ooh"

  if (hasWholeWord(n, "display")) return "digital_display"
  if (hasWholeWord(n, "audio")) return "digital_audio"
  if (hasWholeWord(n, "video")) return "digital_video"

  return "unknown"
}

export function detectChannel(li: FinanceLineItemForDescription): ChannelKey {
  const lt = li.line_type
  if (lt === "service" || lt === "fee") return "fees"
  if (lt === "retainer") return "retainer"

  return detectChannelFromNormalizedString(normalizeDetectionSource(li))
}

function fallbackPrimary(li: FinanceLineItemForDescription): string {
  return (
    trimPart(li.description) ??
    trimPart(li.publisher_name) ??
    trimPart(li.item_code) ??
    "—"
  )
}

function channelLabelFor(key: ChannelKey): string {
  switch (key) {
    case "television":
      return "Television"
    case "radio":
      return "Radio"
    case "newspapers":
      return "Newspapers"
    case "magazines":
      return "Magazines"
    case "ooh":
      return "OOH"
    case "cinema":
      return "Cinema"
    case "digital_display":
      return "Digital display"
    case "digital_audio":
      return "Digital audio"
    case "digital_video":
      return "Digital video"
    case "bvod":
      return "BVOD"
    case "search":
      return "Search"
    case "social":
      return "Social media"
    case "prog_display":
      return "Prog display"
    case "prog_audio":
      return "Prog audio"
    case "prog_video":
      return "Prog video"
    case "prog_ooh":
      return "Prog OOH"
    case "fees":
      return "Fees"
    case "retainer":
      return "Retainer"
    case "unknown":
      return "Unknown"
  }
}

function networkOrPublisher(li: FinanceLineItemForDescription): string | null {
  return firstNonEmpty(li.network, li.publisher_name)
}

function platformOrPublisher(li: FinanceLineItemForDescription): string | null {
  return firstNonEmpty(li.platform, li.publisher_name)
}

function publisherOrName(li: FinanceLineItemForDescription): string | null {
  return firstNonEmpty(li.publisher, li.publisher_name)
}

function buildPrimaryForChannel(
  key: ChannelKey,
  li: FinanceLineItemForDescription
): string {
  switch (key) {
    case "television":
    case "radio":
      return joinDescriptionParts([
        networkOrPublisher(li),
        li.placement,
        li.market,
      ])
    case "newspapers":
    case "magazines":
      return joinDescriptionParts([
        networkOrPublisher(li),
        li.title,
        li.ad_size,
      ])
    case "ooh":
      return joinDescriptionParts([
        networkOrPublisher(li),
        li.format,
        li.market,
      ])
    case "cinema":
      return joinDescriptionParts([networkOrPublisher(li), li.placement])
    case "digital_display":
      return joinDescriptionParts([publisherOrName(li), li.site])
    case "digital_audio":
      return joinDescriptionParts([publisherOrName(li), li.station])
    case "digital_video":
    case "bvod":
      return joinDescriptionParts([li.site, li.market])
    case "search":
    case "social":
    case "prog_display":
    case "prog_audio":
    case "prog_video":
      return joinDescriptionParts([
        platformOrPublisher(li),
        li.bid_strategy,
      ])
    case "prog_ooh":
      return joinDescriptionParts([platformOrPublisher(li), li.creative])
    case "fees":
      return trimPart(li.description) ?? "Fees"
    case "retainer":
      return trimPart(li.description) ?? "Retainer"
    case "unknown":
      return ""
  }
}

export function formatLineItemDescription(
  li: FinanceLineItemForDescription
): { primary: string; channelLabel: string } {
  const key = detectChannel(li)
  const channelLabel = channelLabelFor(key)

  if (key === "fees" || key === "retainer") {
    return { primary: buildPrimaryForChannel(key, li), channelLabel }
  }

  const built = buildPrimaryForChannel(key, li)
  const primary =
    built.length > 0 ? built : fallbackPrimary(li)

  return { primary, channelLabel }
}
