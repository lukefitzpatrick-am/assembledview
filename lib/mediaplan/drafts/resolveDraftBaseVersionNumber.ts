/** Map a working-draft `base_version_id` to the picker `version_number`. */
export function resolveDraftBaseVersionNumber(
  versions: ReadonlyArray<{
    id?: number | string | null
    version_number?: number | string | null
  }>,
  baseVersionId: number | string | null | undefined,
): number | null {
  if (baseVersionId == null || baseVersionId === "") return null
  const want = Number(baseVersionId)
  if (!Number.isFinite(want)) return null
  const hit = versions.find((v) => v.id != null && Number(v.id) === want)
  const n = hit?.version_number == null ? Number.NaN : Number(hit.version_number)
  return Number.isFinite(n) && n > 0 ? n : null
}
