import type { AvaToolContext } from "./types"
import type { ChatInterviewQuestion } from "@/lib/ava/types"
import { toChatInterviewQuestion } from "@/lib/ava/chatInterviewQuestion"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"
import { MEDIA_CONTAINER_ENDPOINTS } from "@/lib/api/media-containers"

export const LIST_CAP = 50
export const TEXT_CAP = 400

export function truncateText(value: unknown, max = TEXT_CAP): string {
  const s = value == null ? "" : String(value)
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function capList<T>(items: T[], max = LIST_CAP): { items: T[]; truncated: number } {
  if (items.length <= max) return { items, truncated: 0 }
  return { items: items.slice(0, max), truncated: items.length - max }
}

export function jsonContent(payload: unknown): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return JSON.stringify({ error: "Unserializable tool result" })
  }
}

/** Admin or empty tenant claims → unscoped (matches pacingAuth). */
export function isUnscopedAvaAccess(context: AvaToolContext): boolean {
  if (context.roles.includes("admin")) return true
  return !context.clientSlugs?.length
}

export function resolveScopedClientSlug(
  context: AvaToolContext,
  requested?: string | null,
): { ok: true; slug?: string } | { ok: false; error: string } {
  const want = (requested || context.clientSlug || "").trim()
  if (isUnscopedAvaAccess(context)) {
    return { ok: true, slug: want || undefined }
  }
  const allowed = new Set(
    (context.clientSlugs ?? []).map((s) => slugifyClientNameForUrl(s)).filter(Boolean),
  )
  if (!want) {
    return {
      ok: false,
      error: "clientSlug is required for scoped sessions. Pass a client the user can access.",
    }
  }
  const normalized = slugifyClientNameForUrl(want)
  if (!normalized || !allowed.has(normalized)) {
    return { ok: false, error: `Client "${want}" is outside this session's access scope.` }
  }
  return { ok: true, slug: want }
}

export function resolveScopedMba(
  context: AvaToolContext,
  requested?: string | null,
): { ok: true; mba?: string } | { ok: false; error: string } {
  const want = (requested || context.mbaNumber || "").trim()
  if (isUnscopedAvaAccess(context) || !context.mbaNumbers?.length) {
    return { ok: true, mba: want || undefined }
  }
  if (!want) {
    return {
      ok: false,
      error: "mbaNumber is required for scoped sessions. Pass an MBA the user can access.",
    }
  }
  const allowed = new Set(context.mbaNumbers.map((m) => m.trim().toLowerCase()).filter(Boolean))
  if (!allowed.has(want.toLowerCase())) {
    return { ok: false, error: `MBA "${want}" is outside this session's access scope.` }
  }
  return { ok: true, mba: want }
}

export function asRecord(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  return {}
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Resolve optional version + media-type filter from Ava tool context for container fetches. */
export function resolveMediaContainerScope(context: AvaToolContext): {
  versionNumber?: number
  mediaTypeFilter?: Array<keyof typeof MEDIA_CONTAINER_ENDPOINTS>
} {
  const versionNumber = context.versionNumber
  const raw = context.enabledMediaTypes
  if (!raw?.length) return { versionNumber: versionNumber ?? undefined }

  const valid = new Set(Object.keys(MEDIA_CONTAINER_ENDPOINTS))
  const mediaTypeFilter = raw.filter(
    (key): key is keyof typeof MEDIA_CONTAINER_ENDPOINTS => valid.has(key),
  )
  return {
    versionNumber: versionNumber ?? undefined,
    mediaTypeFilter: mediaTypeFilter.length ? mediaTypeFilter : undefined,
  }
}

/** Question id for the version-scope gate when page context has no versionNumber. */
export const MI_SCOPE_VERSION_QUESTION_ID = "mi_scope_version"

export type MiVersionScopeResult =
  | { ok: true; versionNumber?: number; mbaWide: boolean }
  | { ok: false; payload: Record<string, unknown>; question: ChatInterviewQuestion }

/**
 * When PageContext has no versionNumber, refuse silent MBA-wide fallback and ask
 * which version to use (MBA-wide is an explicit option). Unchanged when versionNumber
 * is already present on context.
 */
export function resolveMiVersionScope(
  context: AvaToolContext,
  args: Record<string, unknown>,
  priorAnswers: Array<{ questionId: string; answer: string }> = [],
): MiVersionScopeResult {
  if (context.versionNumber !== undefined && context.versionNumber !== null) {
    return { ok: true, versionNumber: context.versionNumber, mbaWide: false }
  }

  const scopeAnswer = priorAnswers.find(
    (answer) => answer.questionId === MI_SCOPE_VERSION_QUESTION_ID,
  )
  const rawAnswer = scopeAnswer?.answer?.trim() ?? ""
  const scopeArg = asString(args.scope)?.toLowerCase()
  const mbaWide = args.mbaWide === true
    || scopeArg === "mba-wide"
    || /^mba[- ]?wide$/i.test(rawAnswer)
  const argVersion = asNumber(args.versionNumber)
    ?? (!mbaWide && rawAnswer ? asNumber(rawAnswer) : undefined)

  if (mbaWide) return { ok: true, versionNumber: undefined, mbaWide: true }
  if (argVersion !== undefined) return { ok: true, versionNumber: argVersion, mbaWide: false }

  return {
    ok: false,
    payload: {
      blocked: true,
      warning: "No media-plan version is in page context.",
      message:
        "Which version should this MI interview use? Enter a version number, or choose MBA-wide for all containers across versions.",
      options: ["MBA-wide"],
    },
    question: toChatInterviewQuestion({
      id: MI_SCOPE_VERSION_QUESTION_ID,
      text: "No media-plan version is in page context. Which version should this interview use? Choose MBA-wide for all containers, or enter a version number.",
      type: "text",
      options: ["MBA-wide"],
      index: 1,
      total: 1,
    }),
  }
}
