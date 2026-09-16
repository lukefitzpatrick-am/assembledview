import {
  CAMPAIGN_READ_BEAT_KEYS,
  CAMPAIGN_READ_HEADINGS,
  EMPTY_CAMPAIGN_READ_BEAT,
  type CampaignReadBeatKey,
  type CampaignReadBeats,
} from "./types"

export class CampaignReadValidationError extends Error {
  readonly code = "VALIDATION"
  constructor(message: string) {
    super(message)
    this.name = "CampaignReadValidationError"
  }
}

function asTrimmedBeat(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.replace(/\r\n/g, "\n").trim()
}

export function emptyCampaignReadBeats(): CampaignReadBeats {
  return {
    planned: EMPTY_CAMPAIGN_READ_BEAT,
    happened: EMPTY_CAMPAIGN_READ_BEAT,
    vsPlan: EMPTY_CAMPAIGN_READ_BEAT,
    best: EMPTY_CAMPAIGN_READ_BEAT,
    worst: EMPTY_CAMPAIGN_READ_BEAT,
    upcoming: EMPTY_CAMPAIGN_READ_BEAT,
  }
}

export function parseCampaignReadBeats(raw: unknown): CampaignReadBeats {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CampaignReadValidationError("beats must be an object")
  }
  const input = raw as Record<string, unknown>
  const beats = emptyCampaignReadBeats()
  for (const key of CAMPAIGN_READ_BEAT_KEYS) {
    const text = asTrimmedBeat(input[key])
    beats[key] = text || EMPTY_CAMPAIGN_READ_BEAT
  }
  return beats
}

export function parseCampaignReadSources(raw: unknown): string[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) {
    throw new CampaignReadValidationError("sources must be an array of strings")
  }
  const items = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
  return items.length ? items : null
}

/** Extract `{ beats, sources }` from an agent reply (fenced JSON or raw). */
export function parseCampaignReadAgentJson(text: string): {
  beats: CampaignReadBeats
  sources: string[] | null
} {
  const raw = extractJsonObject(text)
  if (!raw) {
    throw new CampaignReadValidationError("Campaign read reply was not valid JSON")
  }
  const beats = parseCampaignReadBeats(
    (raw as { beats?: unknown }).beats ?? raw,
  )
  const sources = parseCampaignReadSources((raw as { sources?: unknown }).sources)
  return { beats, sources }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = String(text ?? "").trim()
  if (!trimmed) return null
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function renderCampaignReadMarkdown(beats: CampaignReadBeats): string {
  return CAMPAIGN_READ_BEAT_KEYS.map((key: CampaignReadBeatKey) => {
    return `## ${CAMPAIGN_READ_HEADINGS[key]}\n\n${beats[key]}`
  }).join("\n\n")
}

export function beatsEqual(a: CampaignReadBeats, b: CampaignReadBeats): boolean {
  return CAMPAIGN_READ_BEAT_KEYS.every((key) => a[key] === b[key])
}
