import { avaBoundaries, avaIdentity } from "@/src/ava/systemPrompt"
import { avaVoiceSpec } from "@/src/ava/voiceSpec"
import { getModeInstructions, type ChatMode } from "@/src/ava/modes"
import type { PageContext } from "@/lib/ava/types"

/**
 * Engagement, grounding, and brevity contract for Claude turns.
 * Patches happen via `apply_form_patch` — never via a JSON reply contract in prose.
 */
export const avaEngagementRules = [
  "Engagement and grounding:",
  "1. Answer-first: put the direct answer in the first sentence — a few warm words around it are fine, filler is not. Never open by restating the question or with \"Great question\".",
  "2. One proactive follow-up per reply, max: end with a single concrete next-step offer grounded in tools you actually have (e.g. \"Want the same for [other live client]?\" / \"I can preview the composed names for these line items.\"). Never more than one. Never add a follow-up on error replies.",
  "3. Grounding: if a tool returned the data, cite which surface it came from in plain words (e.g. \"from the published plan v4\"). If no tool can reach it, say exactly that and name what would answer it (e.g. \"I can't see Xero from here\") — no guessing, no invented numbers. Format numbers (AUD with thousands separators, percentages to 1 decimal place).",
  "4. Brevity: default ≤ 150 words. Use tables only when comparing ≥ 3 items. No JSON and no markdown headers in chat replies.",
].join("\n")

/**
 * Claude / tool-era system prompt. Patches happen via `apply_form_patch` —
 * never via a JSON reply contract in prose.
 *
 * Streaming is a later phase; this prompt assumes a full blocking turn.
 */
export function buildAvaSystemPrompt(
  mode: ChatMode,
  pageContext?: PageContext,
  appendix?: string,
): string {
  const parts = [
    avaIdentity,
    avaBoundaries,
    `Voice rules:\n${avaVoiceSpec}`,
    avaEngagementRules,
    getModeInstructions(mode, pageContext),
    summarisePageContext(pageContext),
  ].filter(Boolean)

  if (appendix?.trim()) {
    parts.push(appendix.trim())
  }

  return parts.join("\n\n")
}

function summarisePageContext(pageContext?: PageContext): string | undefined {
  if (!pageContext) return undefined

  const chunks: string[] = []

  const entities = pageContext.entities
  if (entities && typeof entities === "object") {
    const lines = [
      entities.clientName ? `- clientName: ${entities.clientName}` : undefined,
      entities.clientSlug ? `- clientSlug: ${entities.clientSlug}` : undefined,
      entities.campaignName ? `- campaignName: ${entities.campaignName}` : undefined,
      entities.mbaNumber ? `- mbaNumber: ${entities.mbaNumber}` : undefined,
      Array.isArray(entities.mediaTypes) && entities.mediaTypes.length
        ? `- mediaTypes: ${entities.mediaTypes.join(", ")}`
        : undefined,
      entities.versionNumber !== undefined && entities.versionNumber !== null
        ? `- versionNumber: ${entities.versionNumber}`
        : undefined,
      Array.isArray(entities.enabledMediaTypes) && entities.enabledMediaTypes.length
        ? `- enabledMediaTypes: ${entities.enabledMediaTypes.join(", ")}`
        : undefined,
    ].filter(Boolean)
    if (lines.length) chunks.push(`Page entities:\n${lines.join("\n")}`)
  }

  const pageText = pageContext.pageText
  if (pageText && typeof pageText === "object") {
    const lines = [
      pageText.title ? `- title: ${pageText.title}` : undefined,
      Array.isArray(pageText.breadcrumbs) && pageText.breadcrumbs.length
        ? `- breadcrumbs: ${pageText.breadcrumbs.join(" > ")}`
        : undefined,
      Array.isArray(pageText.headings) && pageText.headings.length
        ? `- headings: ${pageText.headings.join(" | ")}`
        : undefined,
    ].filter(Boolean)
    if (lines.length) chunks.push(`Page text:\n${lines.join("\n")}`)
  }

  if (pageContext.state && typeof pageContext.state === "object") {
    chunks.push(
      `Page state snapshot (UI):\n${stringifyAvaContext(pageContext.state, {
        maxArrayItems: 6,
        maxStringLength: 400,
        maxOutputChars: 6000,
      })}`,
    )
  }

  const editable =
    pageContext.fields
      ?.map((field) => ({
        ...field,
        fieldId: field.fieldId || field.id,
      }))
      .filter((field) => field.fieldId && field.editable === true) ?? []

  if (editable.length) {
    chunks.push(
      `Editable field IDs you may update via apply_form_patch:\n${editable
        .map((field) => `- ${field.fieldId}${field.label ? ` (${field.label})` : ""}`)
        .join("\n")}`,
    )
  }

  return chunks.length ? chunks.join("\n\n") : undefined
}

function stringifyAvaContext(
  value: unknown,
  {
    maxArrayItems,
    maxStringLength,
    maxOutputChars,
  }: { maxArrayItems: number; maxStringLength: number; maxOutputChars: number },
): string {
  const seen = new WeakSet<object>()

  const coerce = (input: any, depth: number): any => {
    if (input === null || input === undefined) return input
    if (typeof input === "number" || typeof input === "boolean") return input
    if (typeof input === "string") {
      if (input.length <= maxStringLength) return input
      return `${input.slice(0, maxStringLength)}…`
    }
    if (input instanceof Date) return input.toISOString()
    if (Array.isArray(input)) {
      const head = input.slice(0, maxArrayItems).map((v) => coerce(v, depth + 1))
      return input.length > maxArrayItems
        ? [...head, `… (${input.length - maxArrayItems} more)`]
        : head
    }
    if (typeof input === "object") {
      if (seen.has(input)) return "[Circular]"
      seen.add(input)
      if (depth > 6) return "[MaxDepth]"
      const out: Record<string, any> = {}
      for (const [k, v] of Object.entries(input)) {
        out[k] = coerce(v, depth + 1)
      }
      return out
    }
    return String(input)
  }

  let raw = ""
  try {
    raw = JSON.stringify(coerce(value, 0), null, 2)
  } catch {
    raw = "Unserializable page state."
  }
  if (raw.length <= maxOutputChars) return raw
  return `${raw.slice(0, maxOutputChars)}\n… (truncated)`
}
