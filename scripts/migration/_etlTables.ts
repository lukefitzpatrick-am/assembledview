/**
 * Shared ETL / recon table families.
 *
 * Postgres-authoritative tables are never truncate-reloaded from a Xano
 * snapshot. Recon reports their counts but never fails on mismatch.
 */

/**
 * Postgres-authoritative tables: never truncate-reload from Xano.
 * Writes follow WRITE_BACKEND=postgres with no Xano mirror; a reload would
 * destroy live exclusions (PC0 / X1 design gap).
 */
export const POSTGRES_AUTHORITATIVE_TABLES = new Set([
  "mba_line_approvals",
  /** Forecast target store cutover — app writes PG; ETL must not wipe. */
  "revenue_forecast_lines",
  "revenue_line_catalog",
  // Codex v2 (migration 0013): Postgres-native module, no Xano twin.
  // NEVER truncate-reload these — reloading would destroy live Codex data:
  // tasks, task_checklist_items, task_comments, task_templates, task_template_items,
  // client_notes, client_domains
  "tasks",
  "task_checklist_items",
  "task_comments",
  "task_templates",
  "task_template_items",
  "client_notes",
  "client_domains",
  // T0-9: db:etl truncate-reloaded Xero from the 10 Jul Xano export, wiping
  // every Postgres ingest, every runXeroSync log row, and the resume watermark.
  // Cause of the 11 Jul – 31 Aug ingest gap. NEVER truncate-reload these.
  "xero_ar_invoices",
  "xero_ap_bills",
  "xero_contacts",
  "xero_sync_exceptions",
  "xero_sync_log",
  "xero_invoice_matches",
  "xero_match_month_metrics",
  "xero_contact_links",
  "xero_client_aliases",
  // CB-0..CB-8: finance_billing_records carries the six-state lifecycle
  // (approved_at, approved_by, approved_by_name, approved_amount_cents,
  // approved_lines_hash, exported_at, exported_by, matched_xero_invoice_id,
  // matched_at, matched_by). The Xano snapshot has none of those columns.
  // A truncate-reload destroys every approval and every Xero match.
  // NEVER truncate-reload these.
  "finance_billing_records",
  "finance_billing_line_items",
])

/** Names in the kpi_finance_tasks_xero ETL family (order matches the ETL loop). */
export const KPI_FINANCE_TASKS_XERO_TABLE_NAMES = [
  "campaign_kpi",
  "publisher_kpi",
  "finance_billing_records",
  "finance_billing_line_items",
  "finance_edits",
  "finance_saved_views",
  "revenue_forecast_lines",
  "revenue_line_catalog",
  "scope_of_work",
  "creative_asset",
  "pacing_orphan_fixes",
  "task_templates",
  "task_template_items",
  "tasks",
  "task_checklist_items",
  "task_comments",
  "xero_contacts",
  "xero_ar_invoices",
  "xero_ap_bills",
  "xero_sync_exceptions",
  "xero_sync_log",
  // T0-9: matcher / alias tables listed for skip log only (never had a Xano twin)
  "xero_invoice_matches",
  "xero_match_month_metrics",
  "xero_contact_links",
  "xero_client_aliases",
  "mba_line_approvals",
] as const

export function reloadableTableNames(
  familyNames: readonly string[] = KPI_FINANCE_TASKS_XERO_TABLE_NAMES
): string[] {
  return familyNames.filter((name) => !POSTGRES_AUTHORITATIVE_TABLES.has(name))
}

/**
 * Recon reports these counts but never treats a Xano↔Supabase mismatch as a
 * hard fail (same contract as mba_line_approvals).
 */
export const POSTGRES_AUTHORITATIVE_RECON_TABLES = [
  "mba_line_approvals",
  "revenue_forecast_lines",
  "revenue_line_catalog",
  "xero_ar_invoices",
  "xero_ap_bills",
  "xero_contacts",
  "xero_sync_exceptions",
  "xero_sync_log",
  "xero_invoice_matches",
  "xero_match_month_metrics",
  "xero_contact_links",
  "xero_client_aliases",
] as const

const RECON_INFORMATIONAL = new Set<string>(POSTGRES_AUTHORITATIVE_RECON_TABLES)

export function reconCountMismatchFails(
  table: string,
  xanoCount: number,
  supabaseCount: number
): boolean {
  if (RECON_INFORMATIONAL.has(table)) return false
  return xanoCount !== supabaseCount
}
