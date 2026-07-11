import type { AvaToolContext } from "./types"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"

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
