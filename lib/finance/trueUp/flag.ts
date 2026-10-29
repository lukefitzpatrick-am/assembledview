/**
 * True-up flags. All default off.
 *
 * - TRUE_UP=on gates the report page and GET /api/finance/reports/true-up.
 * - NEXT_PUBLIC_TRUE_UP=on shows the "True-up" link on the Plan
 *   reconciliation page. It is inlined at build time, so a change needs a deploy.
 * - TRUE_UP_ACTIONS=on (Stage 2) adds the fixes: schedule true-ups, mark
 *   explained, one-offs to raise, credit-note flags, invoice links and the
 *   billing timing setting. It needs TRUE_UP too, migrations 0106 and 0109,
 *   and BILLING_REVISION_TOKEN_SECRET (the preview token).
 * - TRUE_UP_CRON=on lets the monthly run on the 2nd save a run and email
 *   OPS_EMAIL_TO. Off: the cron answers 200 and does nothing.
 */

function isOn(raw: string | undefined): boolean {
  const v = String(raw ?? "off").trim().toLowerCase()
  return v === "on" || v === "1" || v === "true"
}

export function isTrueUpEnabled(): boolean {
  return isOn(process.env.TRUE_UP)
}

export function isTrueUpUiEnabled(): boolean {
  return isOn(process.env.NEXT_PUBLIC_TRUE_UP)
}

/** Stage 2 fixes. Needs TRUE_UP as well. */
export function isTrueUpActionsEnabled(): boolean {
  return isTrueUpEnabled() && isOn(process.env.TRUE_UP_ACTIONS)
}

/** The monthly run on the 2nd. Needs TRUE_UP as well. */
export function isTrueUpCronEnabled(): boolean {
  return isTrueUpEnabled() && isOn(process.env.TRUE_UP_CRON)
}

export const TRUE_UP_MARKER = "0109_true_up"
export const TRUE_UP_NOT_READY_MESSAGE = "True-up fixes need migration 0109 (sql/supabase/2026-10-29_0109_true_up_SUPABASE.sql)."
