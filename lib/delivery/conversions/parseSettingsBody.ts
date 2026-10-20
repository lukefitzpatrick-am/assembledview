import {
  conversionEventProblems,
  isConversionCategory,
  isConversionHeadline,
  isConversionPlatform,
  normaliseEventKey,
  type ConversionEventChoice,
  type ConversionSettings,
} from "@/lib/delivery/conversions/rules"

export type ParsedConversionSettingsBody =
  | { ok: true; settings: ConversionSettings; events: ConversionEventChoice[] }
  | { ok: false; problems: string[] }

const MAX_EVENTS = 100

/** Parse and validate a PUT body for the client conversion settings route. */
export function parseConversionSettingsBody(body: unknown): ParsedConversionSettingsBody {
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null
  if (!rec) return { ok: false, problems: ["Send a JSON object."] }
  const problems: string[] = []
  if (typeof rec.enabled !== "boolean") problems.push("enabled must be true or false.")
  if (!isConversionHeadline(rec.headline)) problems.push("headline must be purchases, leads or conversions.")
  if (typeof rec.showRevenue !== "boolean") problems.push("showRevenue must be true or false.")
  const rawEvents = Array.isArray(rec.events) ? rec.events : null
  if (!rawEvents) problems.push("events must be a list.")
  if (rawEvents && rawEvents.length > MAX_EVENTS) problems.push(`At most ${MAX_EVENTS} events.`)

  const events: ConversionEventChoice[] = []
  for (const raw of rawEvents ?? []) {
    const e = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    if (!isConversionPlatform(e.platform)) {
      problems.push(`Unknown platform ${String(e.platform)}.`)
      continue
    }
    const key = typeof e.eventKey === "string" ? normaliseEventKey(e.platform, e.eventKey) : ""
    if (!key) {
      problems.push(`An event on ${e.platform} has no key.`)
      continue
    }
    if (!isConversionCategory(e.category)) {
      problems.push(`${key}: category must be purchase, lead or other.`)
      continue
    }
    const label = typeof e.label === "string" && e.label.trim() ? e.label.trim().slice(0, 120) : null
    events.push({
      platform: e.platform,
      eventKey: key,
      label,
      category: e.category,
      includeValue: e.includeValue === true,
    })
  }
  problems.push(...conversionEventProblems(events))
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    settings: {
      enabled: rec.enabled as boolean,
      headline: rec.headline as ConversionSettings["headline"],
      showRevenue: rec.showRevenue as boolean,
    },
    events,
  }
}
