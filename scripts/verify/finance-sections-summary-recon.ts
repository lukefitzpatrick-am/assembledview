/**
 * FN-FIX-1 reconciliation gate: sections summary receivables FYTD (Postgres
 * schedule_months / published tip) vs legacy hub blob-derived FYTD.
 *
 * Usage:
 *   npm run recon:finance-sections-summary
 *   npm run recon:finance-sections-summary -- --fy=2025
 *
 * Emits per-MBA deltas; every non-zero delta must be dispositioned before merge.
 * Known target: receivables −$658.93 attribution.
 */

import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function parseFyArg(argv: string[]): number | undefined {
  for (const a of argv) {
    if (a.startsWith("--fy=")) {
      const n = Number.parseInt(a.slice(5), 10)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

function aud(cents: number): string {
  return (cents / 100).toFixed(2)
}

async function legacyReceivablesByMba(fy: number): Promise<{
  totalCents: number
  byMba: Map<string, number>
}> {
  const { parseXanoListPayload } = await import("../../lib/api/xano")
  const { xanoMediaPlansUrl } = await import("../../lib/api/xanoClients")
  const { fetchAllXanoPages } = await import("../../lib/api/xanoPagination")
  const { publishedVersionFromMaster } = await import(
    "../../lib/mediaplan/publishedVersionGuard"
  )
  const {
    apiClient,
    getTzParts,
    getAustralianFinancialYearWindow,
    isBookedApprovedCompleted,
    normalizeMbaKey,
    normalizeSchedule,
    parseMonthYear,
    getMonthYearValue,
    pickHighestVersionRow,
    sumLineItems,
  } = await import("../../lib/api/dashboard/shared")
  const {
    australianFyStartYearForDate,
    billingMonthsInAustralianFinancialYear,
    referenceDateForFyStartYear,
  } = await import("../../lib/finance/months")

  const now = new Date()
  const parts = getTzParts(now)
  const currentMonthIso = `${parts.year}-${String(parts.month).padStart(2, "0")}`
  const melbourneCalendar = new Date(parts.year, parts.month - 1, parts.day)
  const currentFyStart = australianFyStartYearForDate(melbourneCalendar)
  const reference = referenceDateForFyStartYear(fy)
  const fyMonths = billingMonthsInAustralianFinancialYear(reference)
  const { start: fyStart, end: fyEnd } = getAustralianFinancialYearWindow(reference)

  let fyMonthAllowed: Set<string>
  if (fy < currentFyStart) fyMonthAllowed = new Set(fyMonths)
  else if (fy > currentFyStart) fyMonthAllowed = new Set()
  else fyMonthAllowed = new Set(fyMonths.filter((m) => m <= currentMonthIso))

  const [allVersions, mastersRaw] = await Promise.all([
    fetchAllXanoPages(
      xanoMediaPlansUrl("media_plan_versions"),
      {},
      "RECON_finance_sections_fytd",
      100,
      50
    ),
    (async () => {
      for (const endpoint of ["media_plan_master", "media_plans_master"] as const) {
        try {
          const response = await apiClient.get(xanoMediaPlansUrl(endpoint))
          return parseXanoListPayload(response.data)
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status
          if (status === 404) continue
          throw err
        }
      }
      return [] as unknown[]
    })(),
  ])

  const publishedByMba = new Map<string, number>()
  for (const master of mastersRaw || []) {
    const m = master as Record<string, unknown>
    const key = normalizeMbaKey(m?.mba_number ?? m?.mbaNumber)
    if (!key) continue
    const published = publishedVersionFromMaster(m)
    if (published > 0) publishedByMba.set(key, published)
  }

  const versionsByMBA = (allVersions as Record<string, unknown>[]).reduce(
    (acc: Record<string, Record<string, unknown>[]>, version) => {
      const mbaNumber = version?.mba_number
      if (!mbaNumber || typeof mbaNumber !== "string") return acc
      acc[mbaNumber] = acc[mbaNumber] || []
      acc[mbaNumber]!.push(version)
      return acc
    },
    {} as Record<string, Record<string, unknown>[]>
  )

  const byMba = new Map<string, number>()
  let totalCents = 0

  for (const [mbaNumber, versionsRaw] of Object.entries(versionsByMBA)) {
    const versions = versionsRaw as Record<string, unknown>[]
    const mbaKey = normalizeMbaKey(mbaNumber) || String(mbaNumber)
    const published = publishedByMba.get(mbaKey)
    const candidatePool =
      published != null && published > 0
        ? versions.filter((v) => {
            const vn = Number(v?.version_number ?? v?.versionNumber ?? 0)
            return Number.isFinite(vn) && vn > 0 && vn <= published
          })
        : versions
    const sorted = candidatePool
      .slice()
      .sort(
        (a, b) => Number(b.version_number || 0) - Number(a.version_number || 0)
      )
    const bookedApproved = sorted.find((v) =>
      isBookedApprovedCompleted(v.campaign_status)
    )
    const version =
      bookedApproved ?? pickHighestVersionRow(versions, published) ?? null
    if (!version) continue

    const billingSchedule = normalizeSchedule(
      version?.billingSchedule ?? version?.billing_schedule
    )
    let mbaAud = 0
    for (const entry of billingSchedule) {
      const monthDate = parseMonthYear(getMonthYearValue(entry))
      if (!monthDate) continue
      if (monthDate.getTime() < fyStart.getTime() || monthDate.getTime() > fyEnd.getTime())
        continue
      const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`
      if (!fyMonthAllowed.has(ym)) continue
      mbaAud += sumLineItems(entry)
    }
    const cents = Math.round(mbaAud * 100)
    if (cents === 0) continue
    byMba.set(mbaNumber, (byMba.get(mbaNumber) ?? 0) + cents)
    totalCents += cents
  }

  return { totalCents, byMba }
}

async function main() {
  const {
    australianFyStartYearForDate,
    billingMonthsInAustralianFinancialYear,
    getCurrentBillingMonth,
    referenceDateForFyStartYear,
  } = await import("../../lib/finance/months")
  const {
    fetchFinanceSectionsSummary,
    fetchReceivablesByMba,
    normalizeSummaryQuery,
    receivablesSqlText,
  } = await import("../../lib/finance/sections/summaryQuery")
  const { closeDb } = await import("../../db")

  const fy = parseFyArg(process.argv.slice(2)) ?? australianFyStartYearForDate()
  const currentMonth = getCurrentBillingMonth()
  const fyMonths = billingMonthsInAustralianFinancialYear(referenceDateForFyStartYear(fy))
  const currentFy = australianFyStartYearForDate()
  const to = fy < currentFy ? fyMonths[fyMonths.length - 1]! : currentMonth
  const from = fyMonths[0]!

  const query = normalizeSummaryQuery({ fy, from, to, clients: [] })

  console.log("=== Finance sections summary recon (FN-FIX-1) ===")
  console.log(`FY=${query.fy} from=${query.from} to=${query.to}`)
  console.log("")
  console.log("--- Receivables SQL (Postgres) ---")
  console.log(receivablesSqlText(query))
  console.log("")

  try {
    const [legacy, summary, byMbaPg] = await Promise.all([
      legacyReceivablesByMba(query.fy),
      fetchFinanceSectionsSummary(query),
      fetchReceivablesByMba(query),
    ])

    const legacyCents = legacy.totalCents
    const newCents = summary.receivablesFytd.cents
    const deltaCents = newCents - legacyCents

    console.log("--- Totals ---")
    console.log(
      ["source", "receivables_fytd_cents", "receivables_fytd_aud", "delta_vs_legacy_cents"].join(
        "\t"
      )
    )
    console.log(
      ["legacy_blob_hub", String(legacyCents), aud(legacyCents), "0"].join("\t")
    )
    console.log(
      [
        "sections_summary_pg",
        String(newCents),
        aud(newCents),
        String(deltaCents),
      ].join("\t")
    )
    console.log("")
    console.log(
      `Sections payables=${aud(summary.payablesFytd.cents)} | lineDetailPct=${summary.coverage.lineDetailPct}`
    )
    console.log("")

    const pgMap = new Map(byMbaPg.map((r) => [r.mba, r.cents]))
    const allMbas = new Set([...legacy.byMba.keys(), ...pgMap.keys()])
    const rows: Array<{
      mba: string
      legacyCents: number
      pgCents: number
      deltaCents: number
    }> = []
    for (const mba of allMbas) {
      const l = legacy.byMba.get(mba) ?? 0
      const p = pgMap.get(mba) ?? 0
      if (l === 0 && p === 0) continue
      rows.push({ mba, legacyCents: l, pgCents: p, deltaCents: p - l })
    }
    rows.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))

    console.log("--- Per-MBA receivables (non-zero either side) ---")
    console.log(["mba", "legacy_cents", "pg_cents", "delta_cents", "delta_aud"].join("\t"))
    let sumAbs = 0
    const nonzero = rows.filter((r) => r.deltaCents !== 0)
    for (const r of nonzero) {
      sumAbs += Math.abs(r.deltaCents)
      console.log(
        [r.mba, String(r.legacyCents), String(r.pgCents), String(r.deltaCents), aud(r.deltaCents)].join(
          "\t"
        )
      )
    }
    console.log("")
    console.log(`Non-zero MBA rows: ${nonzero.length}`)
    console.log(`Sum |delta| cents: ${sumAbs} ($${aud(sumAbs)})`)
    console.log(`Total delta cents: ${deltaCents} ($${aud(deltaCents)})`)

    const TARGET = -65893
    console.log("")
    console.log("--- Dispositions ---")
    if (deltaCents === TARGET || Math.abs(deltaCents - TARGET) <= 1) {
      console.log(`MATCH: total receivables delta equals −$658.93 (${deltaCents} cents).`)
    } else {
      console.log(
        `Total Δ $${aud(deltaCents)} (target −$658.93 = −65893 cents). Attribute below.`
      )
    }
    for (const r of nonzero) {
      let disposition = "PENDING — Luke match-or-decide"
      if (r.legacyCents > 0 && r.pgCents === 0) {
        disposition =
          "LIKELY §E / empty schedule_months on published tip while blob still has months"
      } else if (r.legacyCents === 0 && r.pgCents > 0) {
        disposition =
          "PG published tip has schedule_months; legacy version pool picked empty/other tip"
      } else if (Math.abs(r.deltaCents) === Math.abs(TARGET) && nonzero.length === 1) {
        disposition = `SOLE contributor to −$658.93 — attribute here (${r.mba})`
      }
      console.log(`  ${r.mba}: Δ $${aud(r.deltaCents)} — ${disposition}`)
    }

    if (Math.abs(deltaCents) > 100 && Math.abs(deltaCents - TARGET) > 1) {
      console.error(
        `\nWARN: |delta|=$${aud(Math.abs(deltaCents))} — explain before merge (or confirm §E).`
      )
    } else if (Math.abs(deltaCents) <= 100) {
      console.log("\nOK: totals within $1.")
    }
  } finally {
    await closeDb().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
