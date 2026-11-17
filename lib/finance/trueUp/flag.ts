/**
 * True-up switches live in lib/features/registry.ts (`true_up`, and
 * `true_up_actions` and `true_up_cron`, which require it). Read them with
 * `isFeatureOn`. This module keeps the 0109 marker key.
 */
export const TRUE_UP_MARKER = "0109_true_up"
export const TRUE_UP_NOT_READY_MESSAGE = "True-up fixes need migration 0109 (sql/supabase/2026-10-29_0109_true_up_SUPABASE.sql)."
