/**
 * PC6 read API — xero_invoice_matches + xero_match_month_metrics (admin).
 * Mutations stay on POST /api/finance/xero-match.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { requireRole } from "@/lib/requireRole"
import { getDb } from "@/db"
import { rowsOf } from "@/lib/xero/dbRows"
import { toPeriodMonthDate, toPeriodMonthKey } from "@/lib/finance/periods/monthKey"
import { getSydneyWallClock } from "@/lib/finance/periods/sydneyClock"
import type { XeroMatchRow, XeroMonthMetric } from "@/lib/xero/matchListTypes"

export const dynamic = "force-dynamic"
export type { XeroMatchRow, XeroMonthMetric }

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const url = new URL(request.url)
  const periodMonthParam = url.searchParams.get("periodMonth")
  const focusMonth = toPeriodMonthKey(
    periodMonthParam?.trim() || getSydneyWallClock().periodMonth
  )
  const focusDate = toPeriodMonthDate(focusMonth)

  const db = getDb()

  try {
    const matchRows = rowsOf<{
      id: number
      xero_invoice_id: string
      run_item_id: number | null
      method: string
      confidence: string | number
      delta_cents: number
      status: string
      decided_by: string | null
      decided_at: string | null
      card_kind: string | null
      detail: string | null
      period_month: string | null
      mba_number: string | null
      client_id: number | null
      client_name: string | null
      invoice_reference: string | null
      amount_cents: number | null
      invoice_number: string | null
    }>(
      await db.execute(sql`
        SELECT
          m.id,
          m.xero_invoice_id,
          m.run_item_id,
          m.method::text AS method,
          m.confidence,
          m.delta_cents,
          m.status::text AS status,
          m.decided_by,
          m.decided_at,
          m.card_kind,
          m.detail,
          m.period_month::text AS period_month,
          ri.mba_number,
          ri.client_id,
          COALESCE(
            NULLIF(BTRIM(ri.client_snapshot_json->>'clientName'), ''),
            NULLIF(BTRIM(c.mp_client_name), ''),
            NULL
          ) AS client_name,
          ri.invoice_reference,
          ri.amount_cents,
          ar.invoice_number
        FROM xero_invoice_matches m
        LEFT JOIN finance_run_items ri ON ri.id = m.run_item_id
        LEFT JOIN clients c ON c.id = ri.client_id
        LEFT JOIN xero_ar_invoices ar ON ar.xero_invoice_id = m.xero_invoice_id
        ORDER BY
          CASE m.status::text
            WHEN 'diverged' THEN 0
            WHEN 'disputed' THEN 1
            WHEN 'matched' THEN 2
            ELSE 3
          END,
          m.updated_at DESC
        LIMIT 500
      `)
    )

    const matches: XeroMatchRow[] = matchRows.map((r) => ({
      id: Number(r.id),
      xeroInvoiceId: String(r.xero_invoice_id),
      runItemId: r.run_item_id == null ? null : Number(r.run_item_id),
      method: r.method as XeroMatchRow["method"],
      confidence: Number(r.confidence) || 0,
      deltaCents: Number(r.delta_cents) || 0,
      status: r.status as XeroMatchRow["status"],
      decidedBy: r.decided_by,
      decidedAt: r.decided_at == null ? null : String(r.decided_at),
      cardKind: r.card_kind,
      detail: r.detail,
      periodMonth: r.period_month
        ? toPeriodMonthKey(String(r.period_month).slice(0, 10))
        : null,
      mbaNumber: r.mba_number,
      clientId: r.client_id == null ? null : Number(r.client_id),
      clientName: r.client_name,
      invoiceReference: r.invoice_reference,
      amountCents: r.amount_cents == null ? null : Number(r.amount_cents),
      invoiceNumber: r.invoice_number == null ? null : String(r.invoice_number),
    }))

    const metricRows = rowsOf<{
      period_month: string
      reference_attempts: number
      reference_hits: number
      reference_hit_rate: string | number
      tier1_matched: number
      tier1_diverged: number
      tier2_suggested: number
      duplicates: number
      orphans: number
    }>(
      await db.execute(sql`
        SELECT
          period_month::text AS period_month,
          reference_attempts,
          reference_hits,
          reference_hit_rate,
          tier1_matched,
          tier1_diverged,
          tier2_suggested,
          duplicates,
          orphans
        FROM xero_match_month_metrics
        ORDER BY period_month DESC
        LIMIT 24
      `)
    )

    const unmatchedByMonthRows = rowsOf<{ period_month: string; unmatched_cents: number }>(
      await db.execute(sql`
        SELECT
          period_month::text AS period_month,
          COALESCE(SUM(ABS(delta_cents)), 0)::bigint AS unmatched_cents
        FROM xero_invoice_matches
        WHERE status = 'diverged'::xero_match_status
          AND period_month IS NOT NULL
        GROUP BY period_month
      `)
    )
    const unmatchedByMonth = new Map(
      unmatchedByMonthRows.map((r) => [
        toPeriodMonthKey(String(r.period_month).slice(0, 10)),
        Number(r.unmatched_cents) || 0,
      ])
    )

    const focusUnmatchedRow = rowsOf<{ unmatched_cents: number }>(
      await db.execute(sql`
        SELECT COALESCE(SUM(ABS(delta_cents)), 0)::bigint AS unmatched_cents
        FROM xero_invoice_matches
        WHERE status = 'diverged'::xero_match_status
          AND (period_month = ${focusDate}::date OR period_month IS NULL)
      `)
    )
    const focusUnmatched = Number(focusUnmatchedRow[0]?.unmatched_cents ?? 0) || 0

    const metrics: XeroMonthMetric[] = metricRows.map((r) => {
      const periodMonth = toPeriodMonthKey(String(r.period_month).slice(0, 10))
      return {
        periodMonth,
        referenceAttempts: Number(r.reference_attempts) || 0,
        referenceHits: Number(r.reference_hits) || 0,
        referenceHitRate: Number(r.reference_hit_rate) || 0,
        tier1Matched: Number(r.tier1_matched) || 0,
        tier1Diverged: Number(r.tier1_diverged) || 0,
        tier2Suggested: Number(r.tier2_suggested) || 0,
        duplicates: Number(r.duplicates) || 0,
        orphans: Number(r.orphans) || 0,
        unmatchedCents:
          periodMonth === focusMonth
            ? focusUnmatched
            : unmatchedByMonth.get(periodMonth) ?? 0,
      }
    })

    let focusMetric = metrics.find((m) => m.periodMonth === focusMonth) ?? null
    if (!focusMetric) {
      focusMetric = {
        periodMonth: focusMonth,
        referenceAttempts: 0,
        referenceHits: 0,
        referenceHitRate: 0,
        tier1Matched: 0,
        tier1Diverged: 0,
        tier2Suggested: 0,
        duplicates: 0,
        orphans: 0,
        unmatchedCents: focusUnmatched,
      }
    }

    return NextResponse.json({
      focusMonth,
      matches,
      metrics,
      focusMetric,
      meta: {
        matchCount: matches.length,
        divergedCount: matches.filter((m) => m.status === "diverged").length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Tables may not exist yet (AUTHOR-ONLY migration).
    if (/does not exist|xero_invoice_matches|xero_match_month/i.test(message)) {
      return NextResponse.json({
        focusMonth,
        matches: [],
        metrics: [],
        focusMetric: {
          periodMonth: focusMonth,
          referenceAttempts: 0,
          referenceHits: 0,
          referenceHitRate: 0,
          tier1Matched: 0,
          tier1Diverged: 0,
          tier2Suggested: 0,
          duplicates: 0,
          orphans: 0,
          unmatchedCents: 0,
        },
        meta: { matchCount: 0, divergedCount: 0, tablesMissing: true },
      })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
