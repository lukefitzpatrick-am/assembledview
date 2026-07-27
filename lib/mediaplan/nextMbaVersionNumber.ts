/**
 * MBA PUT versioning: first version row is always 1 when none exist yet.
 * Create seeds master.version_number=1 before any version row; published+1 would
 * incorrectly cut v2 while children still stamp mp_plannumber=1.
 * Existing plans are never renumbered — only the empty-table case returns 1.
 */
export function nextMbaVersionNumber(
  versionRowCount: number,
  publishedVersionNumber: number
): number {
  return versionRowCount === 0 ? 1 : (publishedVersionNumber || 0) + 1
}
