/**
 * FP-2a loader. Read only: SELECTs plus the same composed To bill records the
 * invoicing page lists. Never writes, never materialises a record.
 *
 * Plan of record: billing-basis schedule_months on the published version
 * (pointer AND stamp, PUBLISHED_VERSION_JOIN_SQL). Never max(version_number).
 */

import "server-only"

import { sql } from "drizzle-orm"

import { getDb } from "@/db"
import { loadComposedBillingRecordsForMonth } from "@/lib/finance/loadComposedBillingMonth"
import {
  buildPlanReconciliation,
  joinPlanReconciliationInputs,
  type PlanFactsSqlRow,
  type PlanReconciliationReport,
  type RecordFactsSqlRow,
} from "@/lib/finance/planReconciliation"
import { PUBLISHED_VERSION_JOIN_SQL } from "@/lib/mediaplan/publishedVersionGuard"
import { rowsOf } from "@/lib/xero/dbRows"

/** Production rows: bare `...PROD1` ids and decorated production ids, not the synthetic. */
export const LINE_PRODUCTION_SQL = `(s.line_item_id <> '__service__production' AND (s.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$' OR s.line_item_id ILIKE '%production%'))`

export async function loadPlanReconciliation(month: string): Promise<PlanReconciliationReport> {
  const monthDate = `${month}-01`
  const db = getDb()

  const [planResult, recordResult, composed] = await Promise.all([
    db.execute(sql`
      SELECT
        m.mba_number,
        m.client_id,
        m.mp_client_name,
        m.campaign_name,
        v.id AS version_id,
        v.published_at,
        count(*) AS row_count,
        sum(s.amount_cents) AS total_cents,
        coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'fee'), 0) AS fee_cents,
        coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'adserving'), 0) AS adserving_cents,
        coalesce(sum(s.amount_cents) FILTER (WHERE s.line_item_id = '__service__production'), 0)
          AS service_production_cents,
        coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'media' AND ${sql.raw(LINE_PRODUCTION_SQL)}), 0)
          AS line_production_cents,
        coalesce(sum(s.amount_cents) FILTER (
          WHERE s.component = 'media'
            AND EXISTS (
              SELECT 1 FROM line_items li
              WHERE li.version_id = s.version_id
                AND li.line_item_id = s.line_item_id
                AND li.client_pays_for_media IS TRUE
            )
        ), 0) AS client_pays_media_cents
      FROM media_plan_masters m
      INNER JOIN media_plan_versions v
        ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
      INNER JOIN schedule_months s
        ON s.version_id = v.id
       AND s.basis = 'billing'
       AND s.month = ${monthDate}::date
      GROUP BY m.mba_number, m.client_id, m.mp_client_name, m.campaign_name, v.id, v.published_at
    `),
    db.execute(sql`
      SELECT
        r.invoice_key,
        r.mba_number,
        r.clients_id,
        r.client_name,
        r.campaign_name,
        r.total,
        r.approved_amount_cents,
        r.approved_at
      FROM finance_billing_records r
      WHERE r.billing_type = 'media'
        AND left(coalesce(r.billing_month, ''), 7) = ${month}
        AND coalesce(r.invoice_key, '') NOT LIKE 'xero:%'
    `),
    loadComposedBillingRecordsForMonth({
      monthStr: month,
      includeNonBooked: true,
      filters: {
        types: ["media"],
        clientsIdParam: null,
        searchParam: null,
        statusParam: null,
        publishersIdParam: null,
      },
    }),
  ])

  if (!composed.ok) {
    throw new Error(`Could not load the To bill records for ${month}: ${composed.error}`)
  }

  const inputs = joinPlanReconciliationInputs({
    month,
    plans: rowsOf<PlanFactsSqlRow>(planResult),
    records: rowsOf<RecordFactsSqlRow>(recordResult),
    exported: composed.records.filter((r) => r.billing_type === "media"),
  })
  return buildPlanReconciliation(month, inputs)
}
