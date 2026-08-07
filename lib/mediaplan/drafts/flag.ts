/**
 * PC7 / Stage 2b — `NEXT_PUBLIC_PLAN_DRAFTS=on|off` (default off).
 *
 * ON: autosave chrome (3s IndexedDB / 15s server), soft "Save draft" button,
 *     and pill secondary "autosaved Ns ago".
 *
 * OFF: that chrome is off. Existing `plan_working_drafts` rows are **retained**
 *      (not deleted). Stage 2b load offer (Resume · Compare · Discard) and
 *      save-on-published → working draft stay reachable — drafts are not lost
 *      and not unreachable. Turning the flag back on resumes autosave against
 *      the same rows. Stale-base publish 409 is always on when `baseVersionId`
 *      is sent (not gated by this flag).
 *
 * Do not set this on Vercel from Cursor — Luke flips prod at merge time.
 */
export function isPlanDraftsEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_PLAN_DRAFTS ?? "off").trim().toLowerCase()
  return v === "on" || v === "true" || v === "1"
}
