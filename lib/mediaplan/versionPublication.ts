/**
 * Canonical version-row publication predicate (VC Stage 1).
 *
 * A version is published iff `published_at` is non-null. Never read
 * `campaign_status` (or approved/booked/completed) as publication — that
 * inference is exactly what Stage 1 removes. Do not add a status fallback
 * or "or approved" escape hatch here.
 */

export function isVersionPublished(v: {
  publishedAt?: string | null
  published_at?: string | null
}): boolean {
  return (v.publishedAt ?? v.published_at) != null
}

/**
 * Normalise actor email for `media_plan_versions.published_by`.
 * Migration 0018 CHECK requires lowercase (or NULL). Empty → null.
 */
export function normalisePublishedByEmail(
  email?: string | null
): string | null {
  if (email == null) return null
  const t = String(email).trim().toLowerCase()
  return t.length > 0 ? t : null
}

/**
 * Warn when publish has no resolvable actor. Never throws — publication must
 * still stamp `published_at` with `published_by` null.
 */
export function warnIfPublishMissingPublishedBy(
  mode: string,
  publishedByEmail: string | null,
  meta: { mbaNumber: string }
): void {
  if (mode === "publish" && publishedByEmail == null) {
    console.warn(
      "[plans/save] publish without resolvable actor email; published_by left null",
      meta
    )
  }
}
