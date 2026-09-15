/**
 * Published-version helpers.
 *
 * Two different questions live here — do not conflate them:
 *
 * 1. Staging watermark (`master.version_number` / `publishedVersionFromMaster`)
 *    — which ordinals are live vs staged-ahead. Used by reapers and list caps.
 * 2. Published cut — `published_version_id` AND `published_at` set.
 *    A name that means "published" must not resolve an unstamped pointer.
 *
 * Stamp predicate is canonical in `isVersionPublished` (this module does
 * not re-derive it). SQL joins use {@link PUBLISHED_VERSION_JOIN_SQL}.
 */

import { isVersionPublished } from "@/lib/mediaplan/versionPublication"

export function parseVersionNumber(value: unknown): number {
  if (value == null || value === "") return 0
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Master watermark — the staging ordinal, not the publication predicate. */
export function publishedVersionFromMaster(master: { version_number?: unknown } | null | undefined): number {
  return parseVersionNumber(master?.version_number)
}

/**
 * Raw `published_version_id` on an already-loaded master row. No stamp check.
 * Use this only when the caller must see unstamped pointers (overlay copy,
 * audits). Resolving "the published version" goes through
 * {@link publishedVersionIdFromMaster}.
 *
 * `undefined` = field absent (caller must not invent unpublished).
 * `null` = field present and empty / unusable.
 * number = pointer id (> 0), which may still be unstamped.
 */
export function publishedVersionPointerIdFromMaster(
  master: object | null | undefined,
): number | null | undefined {
  if (master == null || typeof master !== "object") return undefined
  const rec = master as Record<string, unknown>
  const hasSnake = "published_version_id" in rec
  const hasCamel = "publishedVersionId" in rec
  if (!hasSnake && !hasCamel) return undefined
  const raw = hasSnake ? rec.published_version_id : rec.publishedVersionId
  if (raw == null || raw === "") return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

type PointerTargetStamp = {
  publishedAt?: string | null
  published_at?: string | null
}

/**
 * Published version id: pointer AND stamp.
 *
 * `undefined` = pointer field absent.
 * `null` = no published cut (null pointer, unusable id, missing target, or
 * unstamped target — NV-1 / C-113).
 * number = pointer id whose target has `published_at` set.
 */
export function publishedVersionIdFromMaster(
  master: object | null | undefined,
  pointerTarget: PointerTargetStamp | null | undefined,
): number | null | undefined {
  const pointer = publishedVersionPointerIdFromMaster(master)
  if (pointer === undefined) return undefined
  if (pointer == null) return null
  if (pointerTarget == null || !isVersionPublished(pointerTarget)) return null
  return pointer
}

/**
 * Pointer target counts as published only when `published_at` is set.
 * Stale pointer → unpublished row is treated like a null pointer (NV-1).
 * Canonical stamp check: {@link isVersionPublished}.
 */
export function publishedVersionIfStamped<T extends Record<string, unknown>>(
  publishedVersion: T | null | undefined,
): T | null {
  if (publishedVersion == null) return null
  if (!isVersionPublished(publishedVersion as PointerTargetStamp)) return null
  return publishedVersion
}

/**
 * Join predicate for raw SQL: pointer target is the published cut.
 * A NULL pointer stays unpublished (`NULL = id` does not match).
 * Aliases are `m` (masters) and `v` (versions) — finance/dashboard SQL
 * interpolates this fragment (JS strings) or `sql.raw` of it (Drizzle).
 * `probeFinanceScheduleDiffs` is the same predicate without these aliases.
 */
export const PUBLISHED_VERSION_JOIN_SQL =
  "v.id = m.published_version_id AND v.published_at IS NOT NULL"

/** Keep only rows at or below the published watermark. */
export function filterPublishedVersions<T extends { version_number?: unknown }>(
  versions: T[],
  publishedVersionNumber: number,
): T[] {
  const cap = Math.max(0, publishedVersionNumber)
  if (!Array.isArray(versions) || versions.length === 0) return []
  if (cap <= 0) return []
  return versions.filter((v) => parseVersionNumber(v?.version_number) > 0 && parseVersionNumber(v.version_number) <= cap)
}

/** True when a version row is staged ahead of the published master watermark. */
export function isUnpublishedStagedVersion(
  versionNumber: unknown,
  publishedVersionNumber: number,
): boolean {
  const vn = parseVersionNumber(versionNumber)
  const published = Math.max(0, publishedVersionNumber)
  return vn > 0 && published >= 0 && vn > published
}

/**
 * Among candidate version rows, pick the highest version_number that does not
 * exceed the published watermark. Tie-break: highest id.
 */
export function pickPublishedVersionRow<T extends { version_number?: unknown; id?: unknown }>(
  versions: T[],
  publishedVersionNumber: number,
): T | null {
  const published = filterPublishedVersions(versions, publishedVersionNumber)
  if (published.length === 0) return null
  return published.reduce((best, row) => {
    const vn = parseVersionNumber(row.version_number)
    const bn = parseVersionNumber(best.version_number)
    if (vn > bn) return row
    if (vn < bn) return best
    const id = Number(row.id) || 0
    const bestId = Number(best.id) || 0
    return id >= bestId ? row : best
  })
}

/** Cap a "latest" number so it never exceeds the published watermark. */
export function clampLatestToPublished(
  candidateLatest: number,
  publishedVersionNumber: number,
): number {
  const published = Math.max(0, publishedVersionNumber)
  const candidate = Math.max(0, candidateLatest)
  if (published <= 0) return 0
  return Math.min(candidate, published)
}
