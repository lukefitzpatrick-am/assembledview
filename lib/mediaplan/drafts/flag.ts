/** PC7 — NEXT_PUBLIC_PLAN_DRAFTS=on|off (default off). */
export function isPlanDraftsEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_PLAN_DRAFTS ?? "off").trim().toLowerCase()
  return v === "on" || v === "true" || v === "1"
}
