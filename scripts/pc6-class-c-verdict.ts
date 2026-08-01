/**
 * PC6 pre-check: class-(c) completed MBAs with lines but no schedules —
 * any invoice in xero_ar_invoices / finance_billing_records?
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"

function loadDatabaseUrl(): string {
  const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
  const m =
    env.match(/DATABASE_URL="([^"]+)"/) ||
    env.match(/DATABASE_URL=([^\r\n]+)/)
  const url = (m?.[1] || "").trim()
  if (!url) throw new Error("DATABASE_URL missing")
  return url
}

/** Named non-zero class-(c) from PC6 paste + $0 cohort from parse-failure diagnosis. */
const TARGETS: { mba: string; expected_budget: number }[] = [
  { mba: "golf020", expected_budget: 90010 },
  { mba: "PGAAUS005", expected_budget: 34294 },
  { mba: "PENFOLD008", expected_budget: 27500 },
  { mba: "PENFOLD010", expected_budget: 19000 },
  { mba: "PENFOLD011", expected_budget: 19000 },
  { mba: "golf021", expected_budget: 15000 },
  // +5 at $0 from parse-failure class-(c) completed cohort
  { mba: "golf018", expected_budget: 0 },
  { mba: "malay002", expected_budget: 0 },
  { mba: "PENFOLD006", expected_budget: 0 },
  { mba: "PENFOLD009", expected_budget: 0 },
  { mba: "PGAAUS009", expected_budget: 0 },
]

async function main() {
  const sql = postgres(loadDatabaseUrl(), { prepare: false, max: 1 })

  // Discover remaining completed class-(c) empty-schedule rows from PG tip plans if available
  let discovered: { mba: string; expected_budget: number }[] = []
  try {
    const tip = await sql<{ mba: string; budget: string }[]>`
      SELECT upper(m.mba_number) AS mba,
             coalesce((
               SELECT sum(li.budget)::text
               FROM line_items li
               JOIN media_plan_versions v2 ON v2.id = li.version_id
               WHERE v2.master_id = m.id AND v2.version_number = m.version_number
             ), '0') AS budget
      FROM media_plan_masters m
      JOIN media_plan_versions v
        ON v.master_id = m.id AND v.version_number = m.version_number
      WHERE coalesce(m.campaign_status, '') ILIKE 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM schedule_months sm WHERE sm.version_id = v.id
        )
        AND EXISTS (
          SELECT 1 FROM line_items li WHERE li.version_id = v.id
        )
      ORDER BY m.mba_number
    `
    discovered = tip.map((r) => ({
      mba: String(r.mba),
      expected_budget: Number(r.budget) || 0,
    }))
  } catch (err) {
    console.warn("tip discovery failed, using named list only", err)
  }

  const byMba = new Map<string, { mba: string; expected_budget: number }>()
  for (const t of TARGETS) byMba.set(t.mba.toUpperCase(), t)
  for (const t of discovered) {
    const k = t.mba.toUpperCase()
    if (!byMba.has(k)) byMba.set(k, { mba: t.mba, expected_budget: t.expected_budget })
    else if (byMba.get(k)!.expected_budget === 0 && t.expected_budget > 0) {
      byMba.set(k, t)
    }
  }
  // Prefer named non-zero amounts from paste when discovery disagrees
  for (const t of TARGETS) {
    byMba.set(t.mba.toUpperCase(), t)
  }

  const mbas = [...byMba.values()].map((t) => t.mba)
  const rows = await sql`
    WITH targets AS (
      SELECT unnest(${mbas}::text[]) AS mba
    ),
    ar AS (
      SELECT upper(mba_number) AS mba_u,
             count(*)::int AS ar_count,
             coalesce(sum(total), 0)::float8 AS ar_total,
             string_agg(DISTINCT invoice_number, '; ' ORDER BY invoice_number) AS ar_invoices
      FROM xero_ar_invoices
      WHERE mba_number IS NOT NULL
        AND upper(mba_number) = ANY (SELECT upper(mba) FROM targets)
      GROUP BY 1
    ),
    ar_ref AS (
      SELECT t.mba,
             count(a.id)::int AS ar_ref_hits,
             string_agg(DISTINCT a.invoice_number, '; ') AS ar_ref_invoices
      FROM targets t
      LEFT JOIN xero_ar_invoices a
        ON coalesce(a.reference_raw, '') ILIKE '%' || t.mba || '%'
        OR coalesce(a.invoice_number, '') ILIKE '%' || t.mba || '%'
        OR coalesce(a.mba_number, '') ILIKE t.mba
      GROUP BY t.mba
    ),
    fbr AS (
      SELECT upper(mba_number) AS mba_u,
             count(*)::int AS fbr_count,
             coalesce(sum(total), 0)::float8 AS fbr_total,
             bool_or(coalesce(billed, false)) AS any_billed,
             string_agg(DISTINCT coalesce(invoice_key, id::text), '; ') AS fbr_keys
      FROM finance_billing_records
      WHERE mba_number IS NOT NULL
        AND upper(mba_number) = ANY (SELECT upper(mba) FROM targets)
      GROUP BY 1
    )
    SELECT t.mba,
      coalesce(ar.ar_count, 0) AS ar_by_mba_col,
      coalesce(ar.ar_total, 0) AS ar_total,
      ar.ar_invoices,
      coalesce(ar_ref.ar_ref_hits, 0) AS ar_ref_hits,
      ar_ref.ar_ref_invoices,
      coalesce(fbr.fbr_count, 0) AS fbr_count,
      coalesce(fbr.fbr_total, 0) AS fbr_total,
      fbr.any_billed,
      fbr.fbr_keys
    FROM targets t
    LEFT JOIN ar ON ar.mba_u = upper(t.mba)
    LEFT JOIN ar_ref ON upper(ar_ref.mba) = upper(t.mba)
    LEFT JOIN fbr ON fbr.mba_u = upper(t.mba)
    ORDER BY t.mba
  `

  const out: string[] = [
    "mba,expected_budget,ar_by_mba_col,ar_ref_hits,ar_invoices,fbr_count,fbr_any_billed,fbr_total,verdict",
  ]

  for (const r of rows) {
    const mba = String(r.mba)
    const expected = byMba.get(mba.toUpperCase())?.expected_budget ?? 0
    const arHits =
      Number(r.ar_by_mba_col) > 0 || Number(r.ar_ref_hits) > 0
    const fbrHits = Number(r.fbr_count) > 0
    const verdict = arHits || fbrHits ? "invoiced" : "not found"
    const invoices =
      String(r.ar_invoices ?? r.ar_ref_invoices ?? "").replace(/,/g, "|") || ""
    out.push(
      [
        mba,
        expected,
        r.ar_by_mba_col,
        r.ar_ref_hits,
        invoices,
        r.fbr_count,
        r.any_billed ?? false,
        r.fbr_total,
        verdict,
      ].join(","),
    )
  }

  const csvPath = path.join(process.cwd(), "pc6-class-c-invoice-verdict.csv")
  writeFileSync(csvPath, out.join("\n") + "\n", "utf8")
  console.log(out.join("\n"))
  console.log(`\nWrote ${csvPath}`)
  console.log(`discovered tip class-c count=${discovered.length}`)
  await sql.end({ timeout: 5 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
