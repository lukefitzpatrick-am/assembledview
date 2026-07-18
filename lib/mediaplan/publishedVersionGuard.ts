/**
 * Published-version watermark helpers.
 *
 * Staged-but-unpublished saves create media_plan_versions rows whose
 * version_number is greater than master.version_number. Readers must never
 * treat those rows as the live plan.
 */

export function parseVersionNumber(value: unknown): number {
  if (value == null || value === "") return 0
  const n = typeof value === "string" ? parseInt(value, 10) : Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Master watermark — the only published version_number for an MBA. */
export function publishedVersionFromMaster(master: { version_number?: unknown } | null | undefined): number {
  return parseVersionNumber(master?.version_number)
}

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
