/**
 * After POST /api/plans/save succeeds, should we delete this user's
 * `plan_working_drafts` row?
 *
 * Flag off: every save clears (Stage 2b today).
 * Flag on: only when the draft was based on the version just saved from —
 * matching-base auto-applied then published. Stale-base unapplied rows stay.
 */
export function shouldClearWorkingDraftAfterSave(args: {
  savePublishesImmediately: boolean
  draftBaseVersionId: number | null | undefined
  savedFromBaseVersionId: number | null | undefined
}): boolean {
  if (!args.savePublishesImmediately) return true
  if (args.draftBaseVersionId == null || args.savedFromBaseVersionId == null) {
    return false
  }
  return args.draftBaseVersionId === args.savedFromBaseVersionId
}
