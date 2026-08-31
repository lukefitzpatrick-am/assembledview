/**
 * Canonical version-row publication predicate (VC Stage 1).
 *
 * A version is published iff `published_at` is non-null. Never read
 * `campaign_status` (or approved/booked/completed) as publication — that
 * inference is exactly what Stage 1 removes. Do not add a status fallback
 * or "or approved" escape hatch here.
 *
 * Mutability (Stage 2a): `assertVersionMutable` in
 * `lib/mediaplan/assertVersionMutable.ts` (server-only sibling — throws
 * `VERSION_PUBLISHED_IMMUTABLE` when `published_at` is set). Kept out of this
 * file so client pages can import `isVersionPublished` without pulling DB.
 */

export function isVersionPublished(v: {
  publishedAt?: string | null
  published_at?: string | null
}): boolean {
  return (v.publishedAt ?? v.published_at) != null
}

/** 422 copy when generate/download refuses an unpublished version. Never interpolates campaign_status. */
export function unpublishedDocumentError(kind: "download" | "render"): string {
  const verb = kind === "download" ? "download" : "render"
  return `Document ${verb} requires a published version (published_at set)`
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
