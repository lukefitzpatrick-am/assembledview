import {
  loadMiLibrary,
  loadTemplateStructure,
  slugifyPublisher,
  type LoadedMiLibrary,
  type MiFormatRecord,
  type MiFormatText,
  type MiPublisherRecord,
} from "./library.js"

export type MiPlanLineItem = {
  line_item_id: string
  displayName: string
  channelKey: string
  publisher: string
  format: string
  placement?: string
  market?: string
  liveDate?: string
  endDate?: string
  buyType?: string
  bidStrategy?: string
  targeting?: string
  buyingDemo?: string
  budget?: number
  station?: string
  rawFields?: Record<string, string>
}

export type MiPlanInput = {
  lineItems?: Record<string, unknown[]>
  campaign_name?: string
  mp_campaignname?: string
  [key: string]: unknown
}

export type MiOpenQuestion = {
  id: string
  rowRef: { line_item_id: string; displayName: string }
  field: string
  question: string
  type: "choice" | "dimensions" | "text" | "multichoice"
  options?: string[]
  /** Pre-ticked / proposed defaults for AVA to present — never silently applied. */
  selected?: string[]
  source?: string
  appliesTo: string
}

export type MiDerivedAnswer = {
  line_item_id: string
  displayName: string
  field: string
  value: string
  source: string
}

export type MiResolvedSpec = {
  line_item_id: string
  displayName: string
  container_category: string
  publisher_slug: string | null
  format_name: string | null
  confidence: "high" | "medium" | "fallback" | "needs_spec"
  fields_am: Record<string, string>
  fields_specs: Record<string, string>
  fields_client: Record<string, string>
  variant?: string
  sourceNote?: string
}

export type MiAnswer = { questionId: string; answer: string }

export type MiResolveResult = {
  resolved: MiResolvedSpec[]
  open_questions: MiOpenQuestion[]
  derived: MiDerivedAnswer[]
  summary: { resolved: number; open: number }
}

const TAB_ORDER = [
  "Search", "Social", "Programmatic", "Direct Digital", "YouTube", "BVOD",
  "Audio", "OOH", "Print", "Cinema", "Television",
]

const FIELD_ORDER = [
  "placeholder", "publisher", "creative_type", "format", "targeting",
  "variants", "dimensions", "specs_source", "specs_paste",
]

const SPECS_SOURCE_OPTIONS = [
  "upload document",
  "paste text",
  "per booking",
  "skip",
] as const

const SPECS_SOURCE_PROMPT =
  "No specs in the library for this row — do you have the publisher's spec sheet?"

/** Tabs that fill Objective (or Search Bid Strategy) from plan bid_strategy. */
const BID_STRATEGY_FILL_TABS = new Set(["Search", "Social", "Programmatic"])

/** AM columns without Format — Line Item gets " — {format_name}" so multi-format rows stay distinct. */
const AM_WITHOUT_FORMAT = new Set(
  Object.entries(loadTemplateStructure().tabs)
    .filter(([, tab]) => !tab.AM.includes("Format"))
    .map(([name]) => name),
)

const STANDARD_DIMENSIONS = new Set([
  "300x250", "728x90", "300x600", "320x50", "320x100", "970x250",
  "970x90", "160x600", "336x280", "250x250", "200x200", "480x320",
  "320x480", "1080x1080", "1080x1920", "1920x1080", "300x50",
])

const CREATIVE_TERMS_GLOBAL = /\b(video|static|image|carousel|reel|story|stories|in-feed|in feed|shorts)\b/gi
const VIDEO_CLASS = /\b(video|reel|reels|shorts)\b/i
const STATIC_CLASS = /\b(static|image|carousel)\b/i
const PLACEMENT_SIGNAL = /\b(feed|stories|story|carousel|reels|reel|shorts|rsa|pmax|in-stream|instream|bumper|masthead)\b/gi
const CUSTOM_DIRECT_TERMS = /\b(podcast|audio|edm|email|article|bespoke|sponsored|content)\b/i
const DISPLAY_TERMS = /\b(banner|display|mpu|leaderboard)\b|\b\d{2,4}\s*x\s*\d{2,4}\b/i
const DIMENSION_PATTERN = /\b(\d{2,4})\s*x\s*(\d{2,4})\b/gi

type IndexedLine = MiPlanLineItem & { index: number; container: string }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function parseBurstList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value.trim())
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === "object") return [parsed]
    } catch {
      return []
    }
  }
  return []
}

/** Prefer `bursts`; when absent, parse `bursts_json` (array or JSON string). */
function resolveBursts(record: Record<string, unknown>): unknown[] {
  if (Array.isArray(record.bursts)) return record.bursts
  if (record.bursts != null) return parseBurstList(record.bursts)
  return parseBurstList(record.bursts_json)
}

function parseBurstBudget(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, "").trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function firstBurstDate(record: Record<string, unknown>, keys: string[]): string {
  for (const burst of resolveBursts(record)) {
    const date = firstString(asRecord(burst), keys)
    if (date) return date
  }
  return firstString(record, keys)
}

function sumBurstBudgets(record: Record<string, unknown>): number | undefined {
  const bursts = resolveBursts(record)
  if (!bursts.length) return undefined
  let total = 0
  let sawBudget = false
  for (const burst of bursts) {
    const raw = asRecord(burst).budget
    if (raw == null || raw === "") continue
    sawBudget = true
    total += parseBurstBudget(raw)
  }
  return sawBudget ? Math.round(total * 100) / 100 : undefined
}

/** Convert permissive AV media-plan line items into resolver inputs. */
export function flattenPlanLineItems(plan: MiPlanInput): MiPlanLineItem[] {
  const flattened: MiPlanLineItem[] = []
  for (const [channelKey, values] of Object.entries(plan.lineItems ?? {})) {
    if (!Array.isArray(values)) continue
    for (const [index, value] of values.entries()) {
      const row = asRecord(value)
      const publisher = firstString(row, ["publisher", "platform", "network", "site"])
      const format = firstString(row, [
        "placement", "creative", "format", "oohFormat", "ooh_format", "size", "ad_size",
      ])
      const placement = firstString(row, ["placement"])
      const targeting = firstString(row, ["targeting", "creativeTargeting", "creative_targeting"])
      const buyingDemo = firstString(row, ["buyingDemo", "buying_demo"])
      const bidStrategy = firstString(row, ["bidStrategy", "bid_strategy"])
      const budget = sumBurstBudgets(row)
      const rawFields: Record<string, string> = {}
      for (const [field, keys] of Object.entries({
        publisher: ["publisher", "platform", "network", "site"],
        format: ["format", "creative", "oohFormat", "ooh_format", "size", "ad_size"],
        placement: ["placement"],
        targeting: ["targeting", "creativeTargeting", "creative_targeting"],
        bidStrategy: ["bidStrategy", "bid_strategy"],
      })) {
        const raw = firstString(row, keys)
        if (raw) rawFields[field] = raw
      }
      const line_item_id = firstString(row, ["line_item_id", "lineItemId", "id"])
        || `${channelKey}-${index + 1}`
      flattened.push({
        line_item_id,
        displayName: [publisher, format].filter(Boolean).join(" — ") || line_item_id,
        channelKey,
        publisher,
        format,
        placement,
        market: firstString(row, ["market"]),
        liveDate: firstBurstDate(row, ["startDate", "start_date", "liveDate"]),
        endDate: firstBurstDate(row, ["endDate", "end_date"]),
        buyType: firstString(row, ["buyType", "buy_type"]),
        bidStrategy,
        targeting,
        buyingDemo,
        ...(budget !== undefined ? { budget } : {}),
        station: firstString(row, ["station"]),
        rawFields,
      })
    }
  }
  return flattened
}

function containerFor(line: MiPlanLineItem): string {
  const channel = line.channelKey
  const youtube = /\b(youtube|yt)\b/i.test(line.publisher)
  if ((channel === "digitalVideo" || channel === "progVideo") && youtube) return "YouTube"
  if (channel === "search") return "Search"
  if (channel === "socialMedia") return "Social"
  if (["progDisplay", "progVideo", "progAudio", "progOoh"].includes(channel)) return "Programmatic"
  if (["digitalDisplay", "digitalVideo", "digitalAudio", "integration"].includes(channel)) return "Direct Digital"
  if (["bvod", "progBvod"].includes(channel)) return "BVOD"
  // progOoh is Programmatic only — do not also list it under OOH
  if (channel === "ooh") return "OOH"
  if (["newspaper", "magazines"].includes(channel)) return "Print"
  if (channel === "cinema") return "Cinema"
  if (channel === "television") return "Television"
  if (channel === "radio") return "Audio"
  return "Direct Digital"
}

function answerFor(answers: Map<string, string>, appliesTo: string): string | undefined {
  return answers.get(appliesTo)
}

function question(
  line: IndexedLine,
  field: string,
  type: MiOpenQuestion["type"],
  text: string,
  options?: string[],
  selected?: string[],
  source?: string,
): MiOpenQuestion {
  const appliesTo = `${field}:${line.line_item_id}`
  return {
    id: appliesTo,
    rowRef: { line_item_id: line.line_item_id, displayName: line.displayName },
    field,
    question: text,
    type,
    options,
    ...(selected?.length ? { selected } : {}),
    ...(source ? { source } : {}),
    appliesTo,
  }
}

/** Humanise bid_strategy labels only — no funnel remapping. */
export function humanizeBidStrategy(value: string): string {
  return value
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^(cpa|cpc|cpm|cpl|roas|pmax|cpa)$/i.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(" ")
}

function targetingPrefill(line: MiPlanLineItem): string {
  const demo = line.buyingDemo?.trim() ?? ""
  const targeting = line.targeting?.trim() ?? ""
  if (demo && targeting) return `${demo} - ${targeting}`
  return demo || targeting
}

function inferCreativeType(text: string): "video" | "static" | "both" | undefined {
  const hasVideo = VIDEO_CLASS.test(text)
  const hasStatic = STATIC_CLASS.test(text)
  if (hasVideo && hasStatic) return "both"
  if (hasVideo) return "video"
  if (hasStatic) return "static"
  return undefined
}

/** Normalise free-text creative_type answers; unrecognised → undefined (re-ask). */
function normalizeCreativeTypeAnswer(answer: string): "video" | "static" | "both" | undefined {
  const trimmed = answer.trim().toLowerCase()
  if (!trimmed) return undefined
  if (trimmed === "video" || trimmed === "static" || trimmed === "both") return trimmed
  if (/\bboth\b/.test(trimmed)) return "both"
  if (/\bvideo\b/.test(trimmed)) return "video"
  if (/\b(static|image|carousel)\b/.test(trimmed)) return "static"
  return undefined
}

function joinScalar(value: unknown): string {
  if (value == null) return ""
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(", ")
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

function firstFormatString(format: MiFormatRecord | null | undefined, keys: string[]): string {
  if (!format) return ""
  for (const key of keys) {
    const joined = joinScalar(format[key])
    if (joined) return joined
  }
  return ""
}

function textRecordValue(text: MiFormatText, key: string): string {
  if (!text || typeof text === "string") return ""
  const value = text[key]
  return typeof value === "string" ? value.trim() : ""
}

function renderCharacterLimits(text: MiFormatText): string {
  if (!text) return ""
  if (typeof text === "string") return text.trim()
  return Object.entries(text)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join("\n")
}

function renderRatioDimensions(format: MiFormatRecord | null): string {
  if (!format) return ""
  const ratios = [
    ...asStringList(format.ratios_supported),
    ...asStringList(format.ratios),
    ...asStringList(format.ratio_supported),
    ...(format.ratio ? [String(format.ratio)] : []),
  ]
  const uniqueRatios = [...new Set(ratios.map((item) => item.trim()).filter(Boolean))]
  const recommended = firstFormatString(format, ["ratio_recommended"])
  const dims = firstDimension(format)
  const parts: string[] = []
  if (uniqueRatios.length) {
    parts.push(
      recommended && !uniqueRatios.includes(recommended)
        ? `${uniqueRatios.join(", ")} (recommended ${recommended})`
        : recommended
          ? `${uniqueRatios.join(", ")} (recommended ${recommended})`
          : uniqueRatios.join(", "),
    )
  } else if (recommended) {
    parts.push(`recommended ${recommended}`)
  }
  if (dims) parts.push(dims)
  return parts.join("; ")
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === "string" && value.trim()) return [value.trim()]
  return []
}

function renderDuration(format: MiFormatRecord | null): string {
  if (!format) return ""
  const recommended = firstFormatString(format, [
    "duration_recommended", "video_duration_recommended", "duration", "video_duration",
  ])
  const max = firstFormatString(format, ["duration_max", "video_max_duration"])
  if (recommended && max) return `${recommended} (max: ${max})`
  return recommended || max
}

function renderRestrictions(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  if (typeof value === "string" && value.trim()) return [value.trim()]
  return []
}

function renderBestPracticeNotes(
  format: MiFormatRecord | null,
  publisher: MiPublisherRecord | null,
  customText?: string,
  sourceNote?: string,
): string {
  if (customText?.trim()) return customText.trim()
  const notes: string[] = []
  if (format?.best_practice_notes?.length) notes.push(...format.best_practice_notes)
  notes.push(...renderRestrictions(format?.restrictions))
  const audio = firstFormatString(format, ["audio", "audio_spec", "audio_required"])
  if (audio) notes.push(audio)
  const publisherNotes = Array.isArray(publisher?.best_practice_notes)
    ? publisher.best_practice_notes.filter((note): note is string => typeof note === "string")
    : []
  for (const note of publisherNotes) {
    if (!notes.includes(note)) notes.push(note)
  }
  if (notes.length) return notes.join("; ")
  return sourceNote?.trim() ?? ""
}

function publisherSource(record: MiPublisherRecord | null): string {
  if (!record) return ""
  const direct = joinScalar(record.source)
  if (direct) return direct
  return firstString(record as Record<string, unknown>, [
    "source_url", "source_general", "source_topview", "video_source",
  ])
}

function supplyDeadlineRule(
  format: MiFormatRecord | null,
  publisher: MiPublisherRecord | null,
): string {
  const fromFormat = firstFormatString(format, ["supply_deadline_rule"])
  if (fromFormat) return fromFormat
  if (!publisher) return ""
  return firstString(publisher as Record<string, unknown>, [
    "supply_deadline_rule",
    "supply_deadline_general",
    "supply_deadline_rule_default",
  ])
}

function renderAssetGroup(label: string, group: unknown): string[] {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    if (typeof group === "string" && group.trim()) return [`${label}: ${group.trim()}`]
    return []
  }
  const lines: string[] = []
  for (const [key, value] of Object.entries(group as Record<string, unknown>)) {
    if (key === "note" && typeof value === "string" && value.trim()) {
      lines.push(`${label} note: ${value.trim()}`)
      continue
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const detail = Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry != null && entry !== "")
        .map(([entryKey, entry]) => `${entryKey}: ${entry}`)
        .join("; ")
      lines.push(detail ? `${key}: ${detail}` : key)
    } else if (value != null && value !== "") {
      lines.push(`${key}: ${joinScalar(value)}`)
    }
  }
  return lines
}

function renderAssetRequirements(format: MiFormatRecord | null): string {
  if (!format) return ""
  const lines = [
    ...renderAssetGroup("Images", format.images),
    ...renderAssetGroup("Videos", format.videos),
    ...renderAssetGroup("Image requirements", format.image_requirements),
    ...renderAssetGroup("Required assets", format.required_assets),
  ]
  const assetRequirement = firstFormatString(format, ["asset_requirement", "asset_requirements"])
  if (assetRequirement) lines.push(assetRequirement)
  return lines.join("\n")
}

function renderFileType(format: MiFormatRecord | null): string {
  if (!format) return ""
  const primary = firstFormatString(format, ["file_type"])
  if (primary) return primary
  const image = firstFormatString(format, ["file_type_image"])
  const video = firstFormatString(format, ["file_type_video"])
  return [image && `Image: ${image}`, video && `Video: ${video}`].filter(Boolean).join("; ")
}

function renderMaxFileSize(format: MiFormatRecord | null): string {
  if (!format) return ""
  const primary = firstFormatString(format, ["max_file_size"])
  if (primary) return primary
  const image = firstFormatString(format, ["max_file_size_image"])
  const video = firstFormatString(format, ["max_file_size_video"])
  return [image && `Image: ${image}`, video && `Video: ${video}`].filter(Boolean).join("; ")
}

function renderResolution(format: MiFormatRecord | null): string {
  return firstFormatString(format, [
    "resolution",
    "resolution_recommended",
    "min_resolution",
    "resolution_min",
    "resolution_first_party",
  ])
}

function matchFormatByAnswer(
  record: MiPublisherRecord,
  name: string,
): MiFormatRecord | undefined {
  const needle = name.trim().toLowerCase()
  if (!needle) return undefined
  return (record.formats ?? []).find(
    (format) => format.format_name.trim().toLowerCase() === needle,
  )
}

function lineItemLabel(line: IndexedLine, format: MiFormatRecord | null): string {
  if (!format?.format_name) return line.displayName
  if (!AM_WITHOUT_FORMAT.has(line.container)) return line.displayName
  const suffix = ` — ${format.format_name}`
  if (line.displayName.endsWith(suffix)) return line.displayName
  return `${line.displayName}${suffix}`
}

function buildSpecsFields(
  line: IndexedLine,
  publisher: { record: MiPublisherRecord | null },
  format: MiFormatRecord | null,
  customText?: string,
  sourceNote?: string,
): Record<string, string> {
  const text = format?.text
  const dimensions = firstDimension(format) || detectedDimensions(line.format)[0] || ""
  const source = publisherSource(publisher.record)
  const notes = renderBestPracticeNotes(format, publisher.record, customText, sourceNote)
  const deadline = supplyDeadlineRule(format, publisher.record)
  const fileType = renderFileType(format)
  const ratioDimensions = renderRatioDimensions(format) || dimensions
  const fields: Record<string, string> = {}

  const put = (key: string, value: string) => {
    if (value) fields[key] = value
  }

  // Search-specific SPECS columns
  put("Headline Limits", textRecordValue(text, "headlines"))
  put("Description Limits", textRecordValue(text, "descriptions"))
  put(
    "Display Path Limits",
    textRecordValue(text, "display_path") || textRecordValue(text, "display_url_path"),
  )
  put("Asset Requirements", renderAssetRequirements(format))

  // Shared / social-style SPECS columns
  put("File Type", fileType)
  put("Ratio / Dimensions", ratioDimensions)
  put("Ad Dimensions", dimensions)
  put("Pixel Dimensions", dimensions)
  put("Dimensions", dimensions)
  put("Resolution", renderResolution(format))
  put("Max File Size", renderMaxFileSize(format))
  put("File Size Limits", renderMaxFileSize(format))
  put("File Size", renderMaxFileSize(format))
  put("Duration", renderDuration(format))
  put("Creative Duration", renderDuration(format))
  put("Character Limits", renderCharacterLimits(text))
  put(
    "Character Limits (CTA / Headline)",
    [
      textRecordValue(text, "call_to_action") && `call_to_action: ${textRecordValue(text, "call_to_action")}`,
      textRecordValue(text, "headline") && `headline: ${textRecordValue(text, "headline")}`,
      textRecordValue(text, "cta_max") && `cta_max: ${textRecordValue(text, "cta_max")}`,
      textRecordValue(text, "headline_max") && `headline_max: ${textRecordValue(text, "headline_max")}`,
    ].filter(Boolean).join("\n") || renderCharacterLimits(text),
  )
  put("Naming Convention", firstFormatString(format, ["naming_convention"])
    || joinScalar((publisher.record as { universal_specs?: { naming_convention?: unknown } } | null)
      ?.universal_specs?.naming_convention))
  put("Supply Deadline", deadline)
  put("Best Practice Notes", notes)
  put("Publisher-Specific Notes", customText?.trim() || notes)
  put("Source", source)
  put("Aspect Ratio", ratioDimensions)
  put("Restrictions", renderRestrictions(format?.restrictions).join("; "))

  return fields
}

function normalizePlacementSignal(value: string): string {
  const lower = value.toLowerCase()
  if (lower === "story") return "stories"
  if (lower === "reel") return "reels"
  if (lower === "instream") return "in-stream"
  return lower
}

function placementSignals(source: string): string[] {
  return [...new Set(
    [...source.matchAll(PLACEMENT_SIGNAL)].map((match) => normalizePlacementSignal(match[1])),
  )]
}

function creativeSignalCount(source: string): number {
  return [...new Set(
    [...source.matchAll(CREATIVE_TERMS_GLOBAL)].map((match) => match[1].toLowerCase()),
  )].length
}

function impliesMultipleFormats(source: string): boolean {
  return placementSignals(source).length > 1 || creativeSignalCount(source) > 1
}

function placementFamily(formatName: string): string {
  const lower = formatName.toLowerCase()
  if (/performance max/.test(lower)) return "pmax"
  if (/responsive search|\(rsa\)/.test(lower)) return "rsa"
  if (/carousel/.test(lower)) return "carousel"
  if (/stories|story/.test(lower)) return "stories"
  if (/reels/.test(lower)) return "reels"
  if (/feed/.test(lower)) return "feed"
  if (/shorts/.test(lower)) return "shorts"
  if (/bumper/.test(lower)) return "bumper"
  if (/masthead/.test(lower)) return "masthead"
  if (/in-stream|instream/.test(lower)) return "in-stream"
  return `other:${formatName}`
}

function preferFormat(left: MiFormatRecord, right: MiFormatRecord, source: string): MiFormatRecord {
  const leftName = left.format_name.toLowerCase()
  const rightName = right.format_name.toLowerCase()
  const wantsVideo = VIDEO_CLASS.test(source)
  if (wantsVideo) {
    const leftVideo = /video/.test(leftName)
    const rightVideo = /video/.test(rightName)
    if (leftVideo !== rightVideo) return leftVideo ? left : right
  }
  if (/facebook/.test(leftName) !== /facebook/.test(rightName)) {
    return /facebook/.test(leftName) ? left : right
  }
  return left.format_name.localeCompare(right.format_name) <= 0 ? left : right
}

function dedupeFormatCandidates(formats: MiFormatRecord[], source: string): MiFormatRecord[] {
  const byFamily = new Map<string, MiFormatRecord>()
  for (const format of formats) {
    const family = placementFamily(format.format_name)
    const existing = byFamily.get(family)
    byFamily.set(family, existing ? preferFormat(existing, format, source) : format)
  }
  return [...byFamily.values()]
}

function aliasFormatCandidates(
  source: string,
  formats: MiFormatRecord[],
  container: string,
): MiFormatRecord[] {
  const found: MiFormatRecord[] = []
  const lower = source.toLowerCase()
  if (/\bpmax\b/.test(lower) || /\bperformance\s*max\b/.test(lower)) {
    const hit = formats.find((format) => /performance max/i.test(format.format_name))
    if (hit) found.push(hit)
  }
  if (/\brsa\b/.test(lower) || (container === "Search" && /\btext\b/.test(lower))) {
    const hit = formats.find((format) => /responsive search|\(rsa\)/i.test(format.format_name))
    if (hit) found.push(hit)
  }
  return found
}

function sharesPlacementSignal(source: string, formatName: string): boolean {
  const signals = placementSignals(source)
  const lower = formatName.toLowerCase()
  return signals.some((signal) => lower.includes(signal))
}

function nearestPublisherSlugs(value: string, library: LoadedMiLibrary): string[] {
  const normalized = slugifyPublisher(value)
  const tokens = normalized.split("-").filter(Boolean)
  const ranked = library.publishers
    .map((publisher) => {
      const slug = publisher.publisher_slug.toLowerCase()
      const score = tokens.reduce((total, token) => total + (slug.includes(token) ? 2 : 0), 0)
        + (slug.includes(normalized) ? 3 : 0)
        + (levenshteinLite(normalized, slug) <= 2 ? 2 : 0)
      return { slug: publisher.publisher_slug, score }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, 5)
    .map((candidate) => candidate.slug)
  return ranked
}

function levenshteinLite(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

function resolvePublisher(
  line: IndexedLine,
  library: LoadedMiLibrary,
  answers: Map<string, string>,
): { slug: string | null; record: MiPublisherRecord | null; question?: MiOpenQuestion; needsSpec: boolean } {
  const appliesTo = `publisher:${line.line_item_id}`
  const answer = answerFor(answers, appliesTo)
  const proposed = answer ?? slugifyPublisher(line.publisher)
  if (answer?.toLowerCase() === "not in library") {
    return { slug: null, record: null, needsSpec: true }
  }
  const record = library.bySlug.get(proposed)
  if (record) return { slug: proposed, record, needsSpec: false }
  return {
    slug: null,
    record: null,
    needsSpec: false,
    question: question(
      line,
      "publisher",
      "choice",
      `Which publisher matches “${line.publisher || "this row"}”?`,
      [...nearestPublisherSlugs(line.publisher, library), "not in library"],
    ),
  }
}

function formatNames(record: MiPublisherRecord): string[] {
  return (record.formats ?? []).map((format) => format.format_name).filter(Boolean)
}

function formatScore(input: string, name: string): number {
  const normalized = input.toLowerCase()
  const nameTokens = name.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
  return nameTokens.reduce((score, token) => score + (normalized.includes(token) ? 1 : 0), 0)
}

function resolveFormat(
  line: IndexedLine,
  record: MiPublisherRecord,
  answers: Map<string, string>,
  creativeType?: string,
): {
  format: MiFormatRecord | null
  formats?: MiFormatRecord[]
  question?: MiOpenQuestion
  needsSpec: boolean
  fallback: boolean
} {
  const appliesTo = `format:${line.line_item_id}`
  const answer = answerFor(answers, appliesTo)
  if (answer?.toLowerCase() === "none of these") {
    return { format: null, needsSpec: true, fallback: false }
  }
  if (answer) {
    const names = answer.split(",").map((part) => part.trim()).filter(Boolean)
    const selected = names
      .map((name) => matchFormatByAnswer(record, name))
      .filter((format): format is MiFormatRecord => Boolean(format))
    // Unmatched answers must re-open the question — never silently degrade to needs_spec.
    if (selected.length === 0) {
      return {
        format: null,
        needsSpec: false,
        fallback: false,
        question: question(
          line,
          "format",
          "choice",
          `Which ${record.publisher_name} format applies to this row?`,
          [...formatNames(record), "none of these"],
        ),
      }
    }
    if (selected.length === 1) return { format: selected[0], needsSpec: false, fallback: false }
    return { format: selected[0], formats: selected, needsSpec: false, fallback: false }
  }

  // Exact plan format/placement label wins over fuzzy multi-match (e.g. RSA vs Responsive Display).
  for (const candidate of [line.format, line.placement]) {
    if (!candidate?.trim()) continue
    const exact = matchFormatByAnswer(record, candidate)
    if (exact) return { format: exact, needsSpec: false, fallback: false }
  }

  const source = [line.format, line.placement, line.targeting, creativeType].filter(Boolean).join(" ")
  const formats = record.formats ?? []
  const ranked = formats
    .map((format) => ({ format, score: formatScore(source, format.format_name) }))
    .sort((a, b) => b.score - a.score)
  const high = ranked.filter((entry) => entry.score >= 2)
  const aliases = aliasFormatCandidates(source, formats, line.container)
  const signalMatches = ranked
    .filter((entry) => entry.score >= 1 && sharesPlacementSignal(source, entry.format.format_name))
    .map((entry) => entry.format)

  const multi = impliesMultipleFormats(source) || high.length > 1 || (aliases.length + high.length > 1)
  if (multi) {
    const candidates = dedupeFormatCandidates(
      [
        ...high.map((entry) => entry.format),
        ...signalMatches,
        ...aliases,
      ],
      source,
    )
    if (candidates.length > 1) {
      const selected = candidates.map((format) => format.format_name)
      return {
        format: null,
        needsSpec: false,
        fallback: false,
        question: question(
          line,
          "format",
          "multichoice",
          `Which ${record.publisher_name} formats apply to this row? (multiple allowed)`,
          [...formatNames(record), "none of these"],
          selected,
          "from plan: creative",
        ),
      }
    }
    if (candidates.length === 1) {
      return { format: candidates[0], needsSpec: false, fallback: false }
    }
  }

  if (high.length === 1) {
    return { format: high[0].format, needsSpec: false, fallback: false }
  }

  if (containerFor(line) === "Direct Digital" && DISPLAY_TERMS.test(source)) {
    const display = formats.find((format) => /standard display/i.test(format.format_name))
    if (display) return { format: display, needsSpec: false, fallback: true }
  }
  return {
    format: null,
    needsSpec: false,
    fallback: false,
    question: question(
      line,
      "format",
      "choice",
      `Which ${record.publisher_name} format applies to this row?`,
      [...formatNames(record), "none of these"],
    ),
  }
}

function detectedDimensions(value: string): string[] {
  return [...new Set(
    [...value.matchAll(DIMENSION_PATTERN)].map((match) => `${match[1]}x${match[2]}`),
  )]
}

function isMixedFormat(value: string): boolean {
  return /[&+]/.test(value)
    || detectedDimensions(value).length > 1
    || /\bx\d+\s*\/\s*x\d+\b/i.test(value)
}

function placeholderCount(line: MiPlanLineItem): number {
  const fields = [
    line.publisher, line.format, line.placement, line.targeting,
    ...(line.rawFields ? Object.values(line.rawFields) : []),
  ]
  return fields.filter((value) => value?.trim().toLowerCase() === "test").length
}

function firstDimension(format: MiFormatRecord | null): string {
  if (!format?.dimensions) return ""
  if (typeof format.dimensions === "string") return format.dimensions
  return Object.values(format.dimensions).join(", ")
}

function amFieldsFromPlan(line: IndexedLine): {
  fields: Record<string, string>
  derived: MiDerivedAnswer[]
} {
  const fields: Record<string, string> = {}
  const derived: MiDerivedAnswer[] = []
  if (!BID_STRATEGY_FILL_TABS.has(line.container)) return { fields, derived }
  const raw = line.bidStrategy?.trim()
  if (!raw) return { fields, derived }
  const label = humanizeBidStrategy(raw)
  if (line.container === "Search") {
    fields["Bid Strategy"] = label
    derived.push({
      line_item_id: line.line_item_id,
      displayName: line.displayName,
      field: "Bid Strategy",
      value: label,
      source: "from plan: bid_strategy",
    })
  } else {
    fields.Objective = label
    derived.push({
      line_item_id: line.line_item_id,
      displayName: line.displayName,
      field: "Objective",
      value: label,
      source: "from plan: bid_strategy",
    })
  }
  return { fields, derived }
}

function buildResolved(
  line: IndexedLine,
  publisher: { slug: string | null; record: MiPublisherRecord | null; needsSpec: boolean },
  format: MiFormatRecord | null,
  confidence: MiResolvedSpec["confidence"],
  variant?: string,
  sourceNote?: string,
  customText?: string,
): MiResolvedSpec {
  const planAm = amFieldsFromPlan(line).fields
  const displayName = lineItemLabel(line, format)
  const fields_specs = buildSpecsFields(line, publisher, format, customText, sourceNote)
  const fields_am: Record<string, string> = {
    "Line Item": displayName,
    ...planAm,
    ...(line.liveDate ? { "Live Date": line.liveDate } : {}),
  }
  return {
    line_item_id: line.line_item_id,
    displayName,
    container_category: line.container,
    publisher_slug: publisher.slug,
    format_name: format?.format_name ?? (confidence === "needs_spec" ? "NEEDS_SPEC" : null),
    confidence,
    fields_am,
    fields_specs,
    fields_client: {
      Publisher: publisher.record?.publisher_name ?? (line.publisher || ""),
      ...(format?.format_name ? { Format: format.format_name } : {}),
    },
    variant,
    sourceNote,
  }
}

function normalizeSpecsSourceAnswer(
  answer: string,
): "upload document" | "paste text" | "per booking" | "skip" | undefined {
  const trimmed = answer.trim().toLowerCase()
  if (!trimmed) return undefined
  if (trimmed === "upload document" || trimmed === "upload") return "upload document"
  if (trimmed === "paste text" || trimmed === "paste") return "paste text"
  if (trimmed === "per booking") return "per booking"
  if (trimmed === "skip") return "skip"
  return undefined
}

/**
 * Shared offer after publisher/format dead-ends and custom Direct Digital rows.
 * One choice card; paste text opens a follow-up; upload is a stub until B3–B5.
 */
function resolveSpecsSource(
  line: IndexedLine,
  publisher: { slug: string | null; record: MiPublisherRecord | null; needsSpec: boolean },
  answers: Map<string, string>,
  sourceNote: string,
): { resolved: MiResolvedSpec[]; questions: MiOpenQuestion[] } {
  const sourceAnswerRaw = answerFor(answers, `specs_source:${line.line_item_id}`)
  if (!sourceAnswerRaw) {
    return {
      resolved: [],
      questions: [question(
        line,
        "specs_source",
        "choice",
        SPECS_SOURCE_PROMPT,
        [...SPECS_SOURCE_OPTIONS],
      )],
    }
  }

  const sourceAnswer = normalizeSpecsSourceAnswer(sourceAnswerRaw)
  if (!sourceAnswer) {
    return {
      resolved: [],
      questions: [question(
        line,
        "specs_source",
        "choice",
        SPECS_SOURCE_PROMPT,
        [...SPECS_SOURCE_OPTIONS],
      )],
    }
  }

  if (sourceAnswer === "skip") {
    return {
      resolved: [buildResolved(line, publisher, null, "needs_spec", undefined, sourceNote)],
      questions: [],
    }
  }

  if (sourceAnswer === "per booking") {
    return {
      resolved: [buildResolved(line, publisher, null, "needs_spec", undefined, sourceNote, "")],
      questions: [],
    }
  }

  if (sourceAnswer === "upload document") {
    return {
      resolved: [buildResolved(
        line, publisher, null, "needs_spec", undefined, "Awaiting spec upload",
      )],
      questions: [],
    }
  }

  // paste text → follow-up free-text into customText / Publisher-Specific Notes
  const pasteAnswer = answerFor(answers, `specs_paste:${line.line_item_id}`)
  if (!pasteAnswer) {
    return {
      resolved: [],
      questions: [question(
        line,
        "specs_paste",
        "text",
        "Paste the publisher's specs for this row.",
      )],
    }
  }

  return {
    resolved: [buildResolved(
      line, publisher, null, "needs_spec", undefined, sourceNote, pasteAnswer,
    )],
    questions: [],
  }
}

function resolveLine(
  line: IndexedLine,
  library: LoadedMiLibrary,
  answers: Map<string, string>,
): { resolved: MiResolvedSpec[]; questions: MiOpenQuestion[]; derived: MiDerivedAnswer[] } {
  const questions: MiOpenQuestion[] = []
  const derived = amFieldsFromPlan(line).derived
  const placeholder = answerFor(answers, `placeholder:${line.line_item_id}`)
  if (placeholder?.toLowerCase() === "skip") return { resolved: [], questions, derived: [] }
  if (placeholderCount(line) >= 2 && !placeholder) {
    return {
      resolved: [],
      derived: [],
      questions: [question(
        line, "placeholder", "choice",
        "Row looks like placeholder data — include in the MI or skip?",
        ["include", "skip"],
      )],
    }
  }

  const publisher = resolvePublisher(line, library, answers)
  if (publisher.question) return { resolved: [], questions: [publisher.question], derived: [] }
  if (publisher.needsSpec) {
    const specs = resolveSpecsSource(
      line, publisher, answers, "Publisher not in MI library",
    )
    return { resolved: specs.resolved, questions: specs.questions, derived }
  }

  const customInput = [line.format, line.placement].filter(Boolean).join(" ")
  if (line.container === "Direct Digital" && CUSTOM_DIRECT_TERMS.test(customInput)) {
    const specs = resolveSpecsSource(
      line, publisher, answers, "Custom publisher format",
    )
    return { resolved: specs.resolved, questions: specs.questions, derived }
  }

  const needsCreative = line.container === "Social"
    || line.container === "YouTube"
    || /\btiktok\b/i.test(line.publisher)
  const creativeAnswerRaw = answerFor(answers, `creative_type:${line.line_item_id}`)
  const creativeAnswer = creativeAnswerRaw
    ? normalizeCreativeTypeAnswer(creativeAnswerRaw)
    : undefined
  const proposedCreative = needsCreative ? inferCreativeType(customInput) : undefined
  const creativeTypeQuestion = question(
    line, "creative_type", "choice",
    "Is this video, static or both?",
    ["video", "static", "both"],
  )
  // Unrecognised free-text answers re-open — never silently proceed.
  if (needsCreative && creativeAnswerRaw && !creativeAnswer) {
    return {
      resolved: [],
      derived: [],
      questions: [creativeTypeQuestion],
    }
  }
  if (needsCreative && !creativeAnswer && !proposedCreative) {
    return {
      resolved: [],
      derived: [],
      questions: [creativeTypeQuestion],
    }
  }
  if (needsCreative && !creativeAnswer && proposedCreative) {
    questions.push(question(
      line,
      "creative_type",
      "choice",
      "Is this video, static or both?",
      ["video", "static", "both"],
      [proposedCreative],
      "from plan: creative",
    ))
  }
  const effectiveCreative = creativeAnswer ?? proposedCreative

  const format = resolveFormat(
    line,
    publisher.record!,
    answers,
    effectiveCreative === "static" ? "image" : effectiveCreative === "both" ? "video" : effectiveCreative,
  )
  if (format.question) {
    questions.push(format.question)
    return {
      resolved: [buildResolved(line, publisher, null, "needs_spec")],
      questions,
      derived,
    }
  }
  if (format.needsSpec) {
    const specs = resolveSpecsSource(
      line, publisher, answers, "Format is not in the MI library",
    )
    return {
      resolved: specs.resolved,
      questions: specs.questions,
      derived,
    }
  }

  if (line.container === "YouTube" && !answerFor(answers, `targeting:${line.line_item_id}`)) {
    const prefill = targetingPrefill(line)
    questions.push(question(
      line,
      "targeting",
      "text",
      "Confirm or edit the targeting for this YouTube row.",
      undefined,
      prefill ? [prefill] : undefined,
      prefill ? "from plan: creative_targeting + buying_demo" : undefined,
    ))
  }

  if (isMixedFormat(customInput) && !answerFor(answers, `variants:${line.line_item_id}`)) {
    questions.push(question(
      line, "variants", "choice",
      `Confirm the detected variants: ${detectedDimensions(customInput).join(", ") || customInput}.`,
      [detectedDimensions(customInput).join(", ") || customInput, "correct it"],
    ))
  }
  for (const dimension of detectedDimensions(customInput)) {
    if (!STANDARD_DIMENSIONS.has(dimension) && !answerFor(answers, `dimensions:${line.line_item_id}`)) {
      questions.push(question(
        line, "dimensions", "choice",
        `${dimension} isn't a standard size — plan typo or genuine custom size?`,
        ["plan typo", "genuine custom size"],
      ))
      break
    }
  }

  const confidence: MiResolvedSpec["confidence"] = format.fallback ? "fallback" : "high"
  const note = format.fallback ? "Used Standard Display fallback for a display-consistent plan format." : undefined
  const formatList = format.formats?.length ? format.formats : format.format ? [format.format] : [null]
  const variants = effectiveCreative?.toLowerCase() === "both" ? ["video", "static"] : [undefined]
  return {
    resolved: formatList.flatMap((selectedFormat) =>
      variants.map((variant) => buildResolved(line, publisher, selectedFormat, confidence, variant, note))
    ),
    questions,
    derived,
  }
}

function sortQuestions(questions: Array<MiOpenQuestion & { index: number; container: string }>): MiOpenQuestion[] {
  return questions
    .toSorted((a, b) =>
      (TAB_ORDER.indexOf(a.container) - TAB_ORDER.indexOf(b.container))
      || (a.index - b.index)
      || (FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field))
    )
    .map(({ index: _index, container: _container, ...question }) => question)
}

export function resolveMiPlan(
  plan: MiPlanInput,
  library: LoadedMiLibrary = loadMiLibrary(),
  answers: MiAnswer[] = [],
): MiResolveResult {
  const answerMap = new Map<string, string>()
  for (const answer of answers) answerMap.set(answer.questionId, answer.answer)
  const lines = flattenPlanLineItems(plan).map((line, index) => ({
    ...line,
    index,
    container: containerFor(line),
  }))
  const resolved: MiResolvedSpec[] = []
  const derived: MiDerivedAnswer[] = []
  const questions: Array<MiOpenQuestion & { index: number; container: string }> = []
  for (const line of lines) {
    const result = resolveLine(line, library, answerMap)
    resolved.push(...result.resolved)
    derived.push(...result.derived)
    for (const open of result.questions) questions.push({ ...open, index: line.index, container: line.container })
  }
  const open_questions = sortQuestions(questions)
  return {
    resolved,
    open_questions,
    derived,
    summary: { resolved: resolved.length, open: open_questions.length },
  }
}

/** Apply answer IDs (or appliesTo keys) by re-running the deterministic resolver. */
export function applyAnswers(
  plan: MiPlanInput,
  answers: MiAnswer[],
  library?: LoadedMiLibrary,
): MiResolveResult {
  return resolveMiPlan(plan, library ?? loadMiLibrary(), answers)
}
