import {
  loadMiLibrary,
  slugifyPublisher,
  type LoadedMiLibrary,
  type MiFormatRecord,
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
  targeting?: string
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
  type: "choice" | "dimensions" | "text"
  options?: string[]
  appliesTo: string
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
  summary: { resolved: number; open: number }
}

const TAB_ORDER = [
  "Search", "Social", "Programmatic", "Direct Digital", "YouTube", "BVOD",
  "Audio", "OOH", "Print", "Cinema", "Television",
]

const FIELD_ORDER = [
  "placeholder", "publisher", "format", "creative_type", "variants",
  "dimensions", "custom_specs",
]

const STANDARD_DIMENSIONS = new Set([
  "300x250", "728x90", "300x600", "320x50", "320x100", "970x250",
  "970x90", "160x600", "336x280", "250x250", "200x200", "480x320",
  "320x480", "1080x1080", "1080x1920", "1920x1080", "300x50",
])

const CREATIVE_TERMS = /\b(video|static|image|carousel|reel|story|stories|in-feed|in feed|shorts)\b/i
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

function firstBurstDate(record: Record<string, unknown>, keys: string[]): string {
  const bursts = record.bursts
  if (Array.isArray(bursts)) {
    for (const burst of bursts) {
      const date = firstString(asRecord(burst), keys)
      if (date) return date
    }
  }
  return firstString(record, keys)
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
      const targeting = firstString(row, ["targeting", "creativeTargeting"])
      const rawFields: Record<string, string> = {}
      for (const [field, keys] of Object.entries({
        publisher: ["publisher", "platform", "network", "site"],
        format: ["format", "creative", "oohFormat", "ooh_format", "size", "ad_size"],
        placement: ["placement"],
        targeting: ["targeting", "creativeTargeting"],
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
        targeting,
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
  if (["ooh", "progOoh"].includes(channel)) return "OOH"
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
): MiOpenQuestion {
  const appliesTo = `${field}:${line.line_item_id}`
  return {
    id: appliesTo,
    rowRef: { line_item_id: line.line_item_id, displayName: line.displayName },
    field,
    question: text,
    type,
    options,
    appliesTo,
  }
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
): { format: MiFormatRecord | null; question?: MiOpenQuestion; needsSpec: boolean; fallback: boolean } {
  const appliesTo = `format:${line.line_item_id}`
  const answer = answerFor(answers, appliesTo)
  if (answer?.toLowerCase() === "none of these") {
    return { format: null, needsSpec: true, fallback: false }
  }
  if (answer) {
    const selected = (record.formats ?? []).find((format) => format.format_name === answer)
    return selected
      ? { format: selected, needsSpec: false, fallback: false }
      : { format: null, needsSpec: true, fallback: false }
  }

  const source = [line.format, line.placement, creativeType].filter(Boolean).join(" ").toLowerCase()
  const ranked = (record.formats ?? [])
    .map((format) => ({ format, score: formatScore(source, format.format_name) }))
    .sort((a, b) => b.score - a.score)
  if (ranked[0]?.score >= 2) {
    return { format: ranked[0].format, needsSpec: false, fallback: false }
  }

  if (containerFor(line) === "Direct Digital" && DISPLAY_TERMS.test(source)) {
    const display = (record.formats ?? []).find((format) => /standard display/i.test(format.format_name))
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

function buildResolved(
  line: IndexedLine,
  publisher: { slug: string | null; record: MiPublisherRecord | null; needsSpec: boolean },
  format: MiFormatRecord | null,
  confidence: MiResolvedSpec["confidence"],
  variant?: string,
  sourceNote?: string,
  customText?: string,
): MiResolvedSpec {
  const dimensions = firstDimension(format) || detectedDimensions(line.format)[0] || "NEEDS_SPEC"
  const source = publisher.record?.source ?? "NEEDS_SPEC"
  return {
    line_item_id: line.line_item_id,
    displayName: line.displayName,
    container_category: line.container,
    publisher_slug: publisher.slug,
    format_name: format?.format_name ?? "NEEDS_SPEC",
    confidence,
    fields_am: {
      Source: source,
      "File Type": Array.isArray(format?.file_type)
        ? format!.file_type.join(", ")
        : format?.file_type ?? "NEEDS_SPEC",
      Dimensions: dimensions,
    },
    fields_specs: {
      Dimensions: dimensions,
      "Publisher-Specific Notes": customText || sourceNote || "NEEDS_SPEC",
    },
    fields_client: {
      Publisher: publisher.record?.publisher_name ?? (line.publisher || "NEEDS_SPEC"),
      Format: format?.format_name ?? "NEEDS_SPEC",
    },
    variant,
    sourceNote,
  }
}

function resolveLine(
  line: IndexedLine,
  library: LoadedMiLibrary,
  answers: Map<string, string>,
): { resolved: MiResolvedSpec[]; questions: MiOpenQuestion[] } {
  const questions: MiOpenQuestion[] = []
  const placeholder = answerFor(answers, `placeholder:${line.line_item_id}`)
  if (placeholder?.toLowerCase() === "skip") return { resolved: [], questions }
  if (placeholderCount(line) >= 2 && !placeholder) {
    return {
      resolved: [],
      questions: [question(
        line, "placeholder", "choice",
        "Row looks like placeholder data — include in the MI or skip?",
        ["include", "skip"],
      )],
    }
  }

  const publisher = resolvePublisher(line, library, answers)
  if (publisher.question) return { resolved: [], questions: [publisher.question] }
  if (publisher.needsSpec) {
    return { resolved: [buildResolved(line, publisher, null, "needs_spec", undefined, "Publisher not in MI library")], questions }
  }

  const customInput = [line.format, line.placement].filter(Boolean).join(" ")
  const customAnswer = answerFor(answers, `custom_specs:${line.line_item_id}`)
  if (line.container === "Direct Digital" && CUSTOM_DIRECT_TERMS.test(customInput)) {
    if (!customAnswer) {
      return {
        resolved: [],
        questions: [question(
          line, "custom_specs", "text",
          "Custom format — paste the publisher's specs, or answer 'per booking' to flag for manual entry.",
        )],
      }
    }
    return {
      resolved: [buildResolved(
        line, publisher, null, "needs_spec", undefined, "Custom publisher format",
        customAnswer.toLowerCase() === "per booking" ? "" : customAnswer,
      )],
      questions,
    }
  }

  const needsCreative = (line.container === "Social" || line.container === "YouTube" || /\btiktok\b/i.test(line.publisher))
    && !CREATIVE_TERMS.test(customInput)
  const creativeAnswer = answerFor(answers, `creative_type:${line.line_item_id}`)
  if (needsCreative && !creativeAnswer) {
    return {
      resolved: [],
      questions: [question(
        line, "creative_type", "choice",
        "Is this video, static or both?",
        ["video", "static", "both"],
      )],
    }
  }

  const format = resolveFormat(
    line,
    publisher.record!,
    answers,
    creativeAnswer === "static" ? "image" : creativeAnswer === "both" ? "video" : creativeAnswer,
  )
  if (format.question) return { resolved: [], questions: [format.question] }
  if (format.needsSpec) {
    return { resolved: [buildResolved(line, publisher, null, "needs_spec", undefined, "Format is not in the MI library")], questions }
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
  const variants = creativeAnswer?.toLowerCase() === "both" ? ["video", "static"] : [undefined]
  return {
    resolved: variants.map((variant) => buildResolved(line, publisher, format.format, confidence, variant, note)),
    questions,
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
  const questions: Array<MiOpenQuestion & { index: number; container: string }> = []
  for (const line of lines) {
    const result = resolveLine(line, library, answerMap)
    resolved.push(...result.resolved)
    for (const open of result.questions) questions.push({ ...open, index: line.index, container: line.container })
  }
  const open_questions = sortQuestions(questions)
  return {
    resolved,
    open_questions,
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
