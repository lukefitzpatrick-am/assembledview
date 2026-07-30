/**
 * PC6 stage: match AR invoices → finance_run_items (3-tier + duplicate/orphan).
 * Appended to T5 xero-sync; stage-isolated (failure → partial_error, others continue).
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"
import { dollarsToCents, coerceDollars } from "@/lib/xero/money"
import { rowsOf } from "@/lib/xero/dbRows"
import { normalizeContactKey } from "@/lib/xero/normalizeContact"
import {
  runThreeTierMatcher,
  periodShouldReconcile,
  shouldEscalateDay10,
  type MatcherArInvoice,
  type MatcherRunItem,
  type ContactLink,
  type MatchDecision,
} from "@/lib/xero/matcher/threeTier"
import { toPeriodMonthKey, toPeriodMonthDate } from "@/lib/finance/periods/monthKey"

export type MatchRunItemsResult = {
  stage: "match_run_items"
  ok: boolean
  error?: string
  skipped?: string
  auto_matched: number
  cards: number
  reference_hit_rate: number
  stats: {
    tier1_matched: number
    tier1_diverged: number
    tier2_suggested: number
    duplicates: number
    orphans: number
  }
  report_only?: boolean
}

function tablesReadyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  return /finance_run_items|xero_invoice_matches|xero_contact_links|does not exist/i.test(msg)
}

export async function stageMatchRunItems(opts?: {
  reportOnly?: boolean
  now?: Date
}): Promise<MatchRunItemsResult> {
  const emptyStats = {
    tier1_matched: 0,
    tier1_diverged: 0,
    tier2_suggested: 0,
    duplicates: 0,
    orphans: 0,
  }
  try {
    const reportOnly = Boolean(opts?.reportOnly)

    let runItems: MatcherRunItem[] = []
    try {
      runItems = rowsOf<{
        id: number
        period_id: number
        period_month: string
        invoice_reference: string
        amount_cents: number | string
        adjustment_cents: number | string | null
        client_id: number | null
        status: string
      }>(
        await db.execute(sql`
          SELECT
            ri.id,
            ri.period_id,
            to_char(p.period_month, 'YYYY-MM') AS period_month,
            ri.invoice_reference,
            ri.amount_cents,
            ri.adjustment_cents,
            ri.client_id,
            ri.status::text AS status
          FROM finance_run_items ri
          INNER JOIN finance_periods p ON p.id = ri.period_id
          WHERE ri.status::text NOT IN ('excluded')
        `),
      ).map((r) => {
        const adj =
          r.adjustment_cents != null && String(r.status) === "adjusted"
            ? Number(r.adjustment_cents)
            : 0
        return {
          id: Number(r.id),
          periodId: Number(r.period_id),
          periodMonth: String(r.period_month),
          invoiceReference: String(r.invoice_reference ?? ""),
          amountCents: Number(r.amount_cents) + (Number.isFinite(adj) ? adj : 0),
          clientId: r.client_id == null ? null : Number(r.client_id),
          status: String(r.status),
        }
      })
    } catch (err) {
      if (tablesReadyError(err)) {
        return {
          stage: "match_run_items",
          ok: true,
          skipped: "finance_run_items unavailable (apply 0010)",
          auto_matched: 0,
          cards: 0,
          reference_hit_rate: 0,
          stats: emptyStats,
        }
      }
      throw err
    }

    if (runItems.length === 0) {
      return {
        stage: "match_run_items",
        ok: true,
        skipped: "no run items",
        auto_matched: 0,
        cards: 0,
        reference_hit_rate: 0,
        stats: emptyStats,
      }
    }

    const firstPeriodMonth = [...runItems]
      .map((i) => i.periodMonth)
      .sort()[0]!

    const contactNameById = new Map<string, string>()
    for (const c of rowsOf<{ xero_contact_id: string; name: string | null }>(
      await db.execute(sql`SELECT xero_contact_id, name FROM xero_contacts`),
    )) {
      contactNameById.set(String(c.xero_contact_id), String(c.name ?? ""))
    }

    const invoices: MatcherArInvoice[] = rowsOf<{
      xero_invoice_id: string
      invoice_number: string | null
      reference_raw: string | null
      xero_contact_id: string | null
      issue_date: string | null
      total: string | number | null
      status: string | null
    }>(
      await db.execute(sql`
        SELECT
          xero_invoice_id,
          invoice_number,
          reference_raw,
          xero_contact_id,
          issue_date::text AS issue_date,
          total,
          status
        FROM xero_ar_invoices
        WHERE coalesce(status, '') NOT IN ('DELETED', 'VOIDED')
      `),
    ).map((r) => {
      const name = contactNameById.get(String(r.xero_contact_id ?? "")) ?? ""
      return {
        xeroInvoiceId: String(r.xero_invoice_id),
        invoiceNumber: r.invoice_number,
        referenceRaw: r.reference_raw,
        contactKey: name ? normalizeContactKey(name) : null,
        xeroContactId: r.xero_contact_id,
        issueDate: r.issue_date,
        amountCents: dollarsToCents(coerceDollars(r.total)),
        status: r.status,
      }
    })

    let aliases: ContactLink[] = []
    try {
      aliases = rowsOf<{ contact_key: string; client_id: number }>(
        await db.execute(sql`SELECT contact_key, client_id FROM xero_client_aliases`),
      ).map((a) => ({
        xeroContactKey: String(a.contact_key),
        clientId: Number(a.client_id),
      }))
    } catch {
      aliases = []
    }

    let contactLinks: ContactLink[] = []
    try {
      contactLinks = rowsOf<{ xero_contact_key: string; client_id: number }>(
        await db.execute(sql`SELECT xero_contact_key, client_id FROM xero_contact_links`),
      ).map((l) => ({
        xeroContactKey: String(l.xero_contact_key),
        clientId: Number(l.client_id),
      }))
    } catch {
      contactLinks = []
    }

    let existingMatches: Array<{ xeroInvoiceId: string; runItemId: number | null }> = []
    try {
      existingMatches = rowsOf<{
        xero_invoice_id: string
        run_item_id: number | null
      }>(
        await db.execute(sql`
          SELECT xero_invoice_id, run_item_id
          FROM xero_invoice_matches
          WHERE status IN ('matched', 'written_off', 'disputed')
        `),
      ).map((m) => ({
        xeroInvoiceId: String(m.xero_invoice_id),
        runItemId: m.run_item_id == null ? null : Number(m.run_item_id),
      }))
    } catch {
      existingMatches = []
    }

    const result = runThreeTierMatcher({
      runItems,
      invoices,
      contactLinks,
      aliases,
      firstPeriodMonth,
      existingMatches,
    })

    if (!reportOnly) {
      await persistMatcherResult(result.decisions, result.cards, result)
      await maybeReconcilePeriods(runItems, opts?.now ?? new Date())
    }

    // Persist hit-rate metrics per distinct period month (feeds PC5 pre-run)
    if (!reportOnly) {
      await upsertHitRateMetrics(result)
    }

    return {
      stage: "match_run_items",
      ok: true,
      auto_matched: result.autoMatched,
      cards: result.cards.length,
      reference_hit_rate: result.referenceHitRate,
      stats: {
        tier1_matched: result.stats.tier1Matched,
        tier1_diverged: result.stats.tier1Diverged,
        tier2_suggested: result.stats.tier2Suggested,
        duplicates: result.stats.duplicates,
        orphans: result.stats.orphans,
      },
      report_only: reportOnly || undefined,
    }
  } catch (err) {
    if (tablesReadyError(err)) {
      return {
        stage: "match_run_items",
        ok: true,
        skipped: "matcher tables unavailable (apply 0011)",
        auto_matched: 0,
        cards: 0,
        reference_hit_rate: 0,
        stats: emptyStats,
      }
    }
    console.error("[xero-sync] match_run_items failed", err)
    return {
      stage: "match_run_items",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      auto_matched: 0,
      cards: 0,
      reference_hit_rate: 0,
      stats: emptyStats,
    }
  }
}

async function persistMatcherResult(
  decisions: MatchDecision[],
  cards: MatchDecision[],
  result: { referenceHitRate: number; stats: { tier1Matched: number } }
): Promise<void> {
  for (const d of decisions) {
    if (d.cardKind === "duplicate") continue // synthetic multi-id card
    await db.execute(sql`
      INSERT INTO xero_invoice_matches (
        xero_invoice_id, run_item_id, method, confidence, delta_cents,
        status, card_kind, detail, decided_at
      ) VALUES (
        ${d.xeroInvoiceId},
        ${d.runItemId},
        ${d.method}::xero_match_method,
        ${d.confidence},
        ${d.deltaCents},
        ${d.status}::xero_match_status,
        ${d.cardKind},
        ${d.detail ?? null},
        CASE WHEN ${d.status} = 'matched' THEN now() ELSE NULL END
      )
      ON CONFLICT (xero_invoice_id) DO UPDATE SET
        run_item_id = EXCLUDED.run_item_id,
        method = EXCLUDED.method,
        confidence = EXCLUDED.confidence,
        delta_cents = EXCLUDED.delta_cents,
        status = CASE
          WHEN xero_invoice_matches.status IN ('matched', 'written_off', 'disputed')
            THEN xero_invoice_matches.status
          ELSE EXCLUDED.status
        END,
        card_kind = EXCLUDED.card_kind,
        detail = EXCLUDED.detail,
        updated_at = now()
    `)
  }

  for (const c of cards) {
    await db.execute(sql`
      INSERT INTO app_notifications (audience, kind, payload)
      VALUES (
        'finance',
        ${`xero_match_${c.cardKind ?? "card"}`},
        ${JSON.stringify({
          xeroInvoiceId: c.xeroInvoiceId,
          runItemId: c.runItemId,
          method: c.method,
          deltaCents: c.deltaCents,
          detail: c.detail,
          cardKind: c.cardKind,
          autoMatchedHint: result.stats.tier1Matched,
        })}::jsonb
      )
    `)
  }
}

async function upsertHitRateMetrics(result: {
  referenceHitRate: number
  stats: {
    tier1Matched: number
    tier1Diverged: number
    tier2Suggested: number
    duplicates: number
    orphans: number
    referenceAttempts: number
    referenceHits: number
  }
}): Promise<void> {
  const month = toPeriodMonthDate(toPeriodMonthKey(new Date().toISOString()))
  try {
    await db.execute(sql`
      INSERT INTO xero_match_month_metrics (
        period_month, reference_attempts, reference_hits, reference_hit_rate,
        tier1_matched, tier1_diverged, tier2_suggested, duplicates, orphans, updated_at
      ) VALUES (
        ${month}::date,
        ${result.stats.referenceAttempts},
        ${result.stats.referenceHits},
        ${result.referenceHitRate},
        ${result.stats.tier1Matched},
        ${result.stats.tier1Diverged},
        ${result.stats.tier2Suggested},
        ${result.stats.duplicates},
        ${result.stats.orphans},
        now()
      )
      ON CONFLICT (period_month) DO UPDATE SET
        reference_attempts = EXCLUDED.reference_attempts,
        reference_hits = EXCLUDED.reference_hits,
        reference_hit_rate = EXCLUDED.reference_hit_rate,
        tier1_matched = EXCLUDED.tier1_matched,
        tier1_diverged = EXCLUDED.tier1_diverged,
        tier2_suggested = EXCLUDED.tier2_suggested,
        duplicates = EXCLUDED.duplicates,
        orphans = EXCLUDED.orphans,
        updated_at = now()
    `)
  } catch (err) {
    if (!tablesReadyError(err)) throw err
  }
}

async function maybeReconcilePeriods(
  runItems: MatcherRunItem[],
  now: Date
): Promise<void> {
  const periodMonths = [...new Set(runItems.map((i) => i.periodMonth))]
  for (const periodMonth of periodMonths) {
    const openCards = rowsOf<{ n: number }>(
      await db.execute(sql`
        SELECT count(*)::int AS n
        FROM app_notifications
        WHERE audience = 'finance'
          AND kind LIKE 'xero_match_%'
          AND read_at IS NULL
          AND coalesce(payload->>'periodMonth', ${periodMonth}) = ${periodMonth}
      `),
    )[0]

    const open = Number(openCards?.n ?? 0)
    if (periodShouldReconcile(open)) {
      await db.execute(sql`
        UPDATE finance_periods
        SET status = 'reconciled'
        WHERE period_month = ${toPeriodMonthDate(periodMonth)}::date
          AND status IN ('locked', 'invoiced', 'review')
      `)
    }

    if (shouldEscalateDay10({ periodMonth, now, openCardCount: open })) {
      await db.execute(sql`
        INSERT INTO app_notifications (audience, kind, payload)
        VALUES (
          'finance-lead',
          'xero_match_day10_escalate',
          ${JSON.stringify({ periodMonth, openCardCount: open })}::jsonb
        )
      `)
    }
  }
}

/** Report-only replay helper (no writes). */
export async function replayMatcherReportOnly(): Promise<MatchRunItemsResult> {
  return stageMatchRunItems({ reportOnly: true })
}
