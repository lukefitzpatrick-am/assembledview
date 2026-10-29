/**
 * True-up switches (lib/features/registry.ts). All default off.
 * Set on /admin/features; before 0111 or with no row they read the old env vars.
 *
 * - true_up (TRUE_UP) gates the report page, GET /api/finance/reports/true-up,
 *   the True-up link on Plan reconciliation (browser: clientFeatureOn) and
 *   Ava's query_true_up.
 * - true_up_actions (TRUE_UP_ACTIONS) adds the fixes: schedule true-ups, mark
 *   explained, one-offs to raise, credit-note flags, invoice links and the
 *   billing timing setting. Needs true_up too, migrations 0106 and 0109, and a
 *   signing secret for the preview token.
 * - true_up_cron (TRUE_UP_CRON) lets the monthly run on the 2nd save a run and
 *   email OPS_EMAIL_TO. Off: the cron answers 200 and does nothing.
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"

type FeatureReader = (key: "true_up" | "true_up_actions" | "true_up_cron") => Promise<boolean>

const serverReader: FeatureReader = (key) => isFeatureOn(key)

export async function isTrueUpEnabled(read: FeatureReader = serverReader): Promise<boolean> {
  return read("true_up")
}

/** Stage 2 fixes. Needs true_up as well. */
export async function isTrueUpActionsEnabled(read: FeatureReader = serverReader): Promise<boolean> {
  return (await read("true_up")) && (await read("true_up_actions"))
}

/** The monthly run on the 2nd. Needs true_up as well. */
export async function isTrueUpCronEnabled(read: FeatureReader = serverReader): Promise<boolean> {
  return (await read("true_up")) && (await read("true_up_cron"))
}

export const TRUE_UP_MARKER = "0109_true_up"
export const TRUE_UP_NOT_READY_MESSAGE = "True-up fixes need migration 0109 (sql/supabase/2026-10-29_0109_true_up_SUPABASE.sql)."
