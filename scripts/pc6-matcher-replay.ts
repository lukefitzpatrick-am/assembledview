/**
 * PC6 report-only matcher replay against live AR + run items (or FBR proxy).
 * Does not write matches. Prints tier rates vs historical 1,288-exception baseline.
 *
 * Usage: npx tsx scripts/pc6-matcher-replay.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import {
  runThreeTierMatcher,
  type MatcherArInvoice,
  type MatcherRunItem,
} from "../lib/xero/matcher/threeTier"
import { dollarsToCents, coerceDollars } from "../lib/xero/money"
import { normalizeContactKey } from "../lib/xero/normalizeContact"

const HISTORICAL_EXCEPTION_BASELINE = 1288

function loadDatabaseUrl(): string {
  const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  const m =
    env.match(/DATABASE_URL="([^"]+)"/) ||
    env.match(/DATABASE_URL=([^\r\n]+)/)
  const url = (m?.[1] || "").trim()
  if (!url) throw new Error("DATABASE_URL missing")
  return url
}

async function main() {
  const sql = postgres(loadDatabaseUrl(), { prepare: false, max: 1 })

  // Prefer finance_run_items; fall back to billed finance_billing_records as proxy
  // for "last real locked month manual data" until PC5 periods are populated.
  let runItems: MatcherRunItem[] = []
  let source = "finance_run_items"
  try {
    const rows = await sql`
      SELECT
        ri.id,
        ri.period_id,
        to_char(p.period_month, 'YYYY-MM') AS period_month,
        ri.invoice_reference,
        ri.amount_cents,
        ri.client_id,
        ri.status::text AS status
      FROM finance_run_items ri
      INNER JOIN finance_periods p ON p.id = ri.period_id
      WHERE p.status IN ('locked', 'invoiced', 'reconciled')
    `
    runItems = rows.map((r) => ({
      id: Number(r.id),
      periodId: Number(r.period_id),
      periodMonth: String(r.period_month),
      invoiceReference: String(r.invoice_reference ?? ""),
      amountCents: Number(r.amount_cents) || 0,
      clientId: r.client_id == null ? null : Number(r.client_id),
      status: String(r.status),
    }))
  } catch {
    source = "finance_billing_records_proxy"
  }

  if (runItems.length === 0) {
    source = "finance_billing_records_proxy"
    const rows = await sql`
      SELECT
        id,
        mba_number,
        clients_id,
        billing_month,
        total,
        invoice_key,
        status
      FROM finance_billing_records
      WHERE coalesce(billed, false) = true
         OR lower(coalesce(status, '')) IN ('billed', 'invoiced', 'paid')
    `
    runItems = rows.map((r) => {
      const mba = String(r.mba_number ?? "").trim().toUpperCase()
      const monthRaw = String(r.billing_month ?? "").trim()
      const month = /^\d{4}-\d{2}/.test(monthRaw)
        ? monthRaw.slice(0, 7)
        : monthRaw
      const ym = month.replace("-", "")
      // Proxy refs: prefer AV-{mba}-{YYYYMM} (PC5 shape) AND also expose MBA token
      // via invoiceReference = mba when present so tier-1 can hit historical refs.
      const avRef = mba && ym ? `AV-${mba}-${ym}` : String(r.invoice_key ?? `FBR-${r.id}`)
      const ref = mba || avRef
      return {
        id: Number(r.id),
        periodId: 0,
        periodMonth: month.slice(0, 7) || "2026-01",
        invoiceReference: ref,
        amountCents: dollarsToCents(coerceDollars(r.total)),
        clientId: r.clients_id == null ? null : Number(r.clients_id),
        status: "approved",
      }
    })

    // Duplicate each billed row as AV-ref candidate when MBA present (PC5 future shape)
    const extras: MatcherRunItem[] = []
    for (const r of rows) {
      const mba = String(r.mba_number ?? "").trim().toUpperCase()
      const monthRaw = String(r.billing_month ?? "").trim()
      const month = /^\d{4}-\d{2}/.test(monthRaw)
        ? monthRaw.slice(0, 7)
        : monthRaw
      const ym = month.replace("-", "")
      if (!mba || !ym) continue
      extras.push({
        id: Number(r.id) + 1_000_000_000,
        periodId: 0,
        periodMonth: month.slice(0, 7) || "2026-01",
        invoiceReference: `AV-${mba}-${ym}`,
        amountCents: dollarsToCents(coerceDollars(r.total)),
        clientId: r.clients_id == null ? null : Number(r.clients_id),
        status: "approved",
      })
    }
    runItems = [...runItems, ...extras]
  }

  const contacts = await sql`SELECT xero_contact_id, name FROM xero_contacts`
  const contactNameById = new Map(
    contacts.map((c) => [String(c.xero_contact_id), String(c.name ?? "")])
  )

  const ar = await sql`
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
  `
  const invoices: MatcherArInvoice[] = ar.map((r) => {
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

  let aliases: { xeroContactKey: string; clientId: number }[] = []
  try {
    const a = await sql`SELECT contact_key, client_id FROM xero_client_aliases`
    aliases = a.map((r) => ({
      xeroContactKey: String(r.contact_key),
      clientId: Number(r.client_id),
    }))
  } catch {
    aliases = []
  }

  const firstPeriodMonth =
    [...runItems.map((i) => i.periodMonth)].sort()[0] ?? "2025-01"

  const result = runThreeTierMatcher({
    runItems,
    invoices,
    contactLinks: [],
    aliases,
    firstPeriodMonth,
  })

  const arCount = invoices.length
  const exceptionLike =
    result.stats.tier1Diverged +
    result.stats.tier2Suggested +
    result.stats.duplicates +
    result.stats.orphans
  const silentMatchRate =
    arCount === 0 ? 0 : result.stats.tier1Matched / arCount

  const report = {
    source,
    run_items: runItems.length,
    ar_invoices: arCount,
    tier1_matched: result.stats.tier1Matched,
    tier1_diverged: result.stats.tier1Diverged,
    tier2_suggested: result.stats.tier2Suggested,
    duplicates: result.stats.duplicates,
    orphans: result.stats.orphans,
    reference_hit_rate: result.referenceHitRate,
    silent_match_rate_of_ar: silentMatchRate,
    exception_like_cards: exceptionLike,
    historical_exception_baseline: HISTORICAL_EXCEPTION_BASELINE,
    exception_delta_vs_baseline: exceptionLike - HISTORICAL_EXCEPTION_BASELINE,
  }

  const outPath = path.join(process.cwd(), "pc6-matcher-replay-report.json")
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
