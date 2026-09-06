/**
 * PC7 / Stage 2b — `NEXT_PUBLIC_PLAN_DRAFTS=on|off` (default off).
 *
 * ON: autosave chrome (3s IndexedDB / 15s server), soft "Save draft" button,
 *     and pill secondary "autosaved Ns ago".
 *
 * OFF: that chrome is off. Existing `plan_working_drafts` rows are **retained**
 *      (not deleted). Stage 2b load offer (Resume · Compare · Discard) stays
 *      reachable. **Interim `SAVE_PUBLISHES_IMMEDIATELY`:** Save publishes —
 *      there is no save-on-published working-draft path until that constant
 *      is flipped. Turning this chrome flag back on resumes autosave against
 *      the same rows. Stale-base publish 409 is always on when
 *      `tipVersionIdAtLoad` is sent and the published pointer has moved —
 *      the chosen `baseVersionId` does not participate.
 *
 * Do not set this on Vercel from Cursor — Luke flips prod at merge time.
 */
export function isPlanDraftsEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_PLAN_DRAFTS ?? "off").trim().toLowerCase()
  return v === "on" || v === "true" || v === "1"
}
