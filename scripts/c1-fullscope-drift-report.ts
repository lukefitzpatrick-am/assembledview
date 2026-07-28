/**
 * Plan C S1-P2 — one-shot full-scope drift report for Luke's log-only week.
 *
 * Runs the same collectFullScopeDeltas / billable-aligned MBA check against every
 * live (booked|approved) campaign's current published version.
 *
 * Usage: npx tsx scripts/c1-fullscope-drift-report.ts
 * Writes CSV to stdout and a summary line to stderr.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import axios from "axios"

import { parsePersistedBillingScheduleToMonths } from "@/lib/billing/parsePersistedBillingScheduleToMonths"
import {
  collectFullScopeDeltas,
  type FullScopeDelta,
} from "@/lib/finance/c1FullScopeGate"
import {
  computeBillableAlignedMbaTotalExGst,
  monthExGstFromScheduleEntry,
} from "@/lib/finance/computeBillableAlignedMbaTotal"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import { getDeliverySchedule, getBillingSchedule } from "@/lib/finance/normalizeFields"
import { buildMbaToLatestVersionMap } from "@/lib/finance/relevantPlanVersions"
import { roundMoney2 } from "@/lib/format/money"
import { isLiveCampaignStatus } from "@/lib/types/mediaPlanMaster"
import { fetchAllXanoPages } from "@/lib/api/xanoPagination"
import { xanoAuthHeaderRecord, xanoUrl } from "@/lib/api/xano"

type CsvRow = {
  mba_number: string
  version_number: string
  campaign_status: string
  line: string
  component: string
  client_total: string
  server_total: string
  delta: string
  label: string
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue
      const i = line.indexOf("=")
      const key = line.slice(0, i).trim()
      const val = line.slice(i + 1).replace(/^["']|["']$/g, "")
      if (key && process.env[key] == null) process.env[key] = val
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnvLocal()

  const mastersRaw = await axios.get(
    xanoUrl("media_plan_master", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
    { headers: xanoAuthHeaderRecord(), timeout: 60_000 }
  )
  const masters = Array.isArray(mastersRaw.data) ? mastersRaw.data : []
  const liveMasters = masters.filter((m: { campaign_status?: string }) =>
    isLiveCampaignStatus(m.campaign_status)
  )
  const mbaToVersion = buildMbaToLatestVersionMap(liveMasters)

  const allVersions = await fetchAllXanoPages(
    xanoUrl("media_plan_versions", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"]),
    {},
    "c1-fullscope-drift-report",
    100,
    80
  )

  const published: Record<string, unknown>[] = []
  for (const v of allVersions) {
    if (!v || typeof v !== "object") continue
    const row = v as Record<string, unknown>
    const mba = String(row.mba_number ?? "").trim()
    if (!mba) continue
    const info = mbaToVersion.get(mba)
    if (!info) continue
    if (Number(row.version_number) !== Number(info.versionNumber)) continue
    if (
      info.masterId &&
      row.media_plan_master_id != null &&
      Number(row.media_plan_master_id) !== Number(info.masterId)
    ) {
      continue
    }
    published.push(row)
  }

  const statusByMba = new Map(
    liveMasters.map((m: { mba_number?: string; campaign_status?: string }) => [
      String(m.mba_number ?? ""),
      String(m.campaign_status ?? ""),
    ])
  )

  const csvRows: CsvRow[] = []
  let checked = 0
  let skipped = 0
  let violationCampaigns = 0

  for (const version of published) {
    const mba = String(version.mba_number ?? "")
    const vn = String(version.version_number ?? "")
    const status = statusByMba.get(mba) ?? ""

    const billingRaw = getBillingSchedule(version)
    const deliveryRaw = getDeliverySchedule(version)
    const billingMonths = parsePersistedBillingScheduleToMonths(billingRaw) ?? []
    const deliveryMonths = parsePersistedBillingScheduleToMonths(deliveryRaw) ?? []

    if (billingMonths.length === 0 && deliveryMonths.length === 0) {
      skipped++
      continue
    }

    checked++
    const financials = computeCampaignFinancialsFromVersion(version)
    const deltas: FullScopeDelta[] = []

    if (financials) {
      deltas.push(
        ...collectFullScopeDeltas({
          clientSchedule: billingMonths.length ? billingMonths : financials.billingSchedule,
          lineItems: [],
          financials,
          version,
        })
      )
    } else {
      // Schedule-only billable≠MBA (same aligned helper).
      const aligned = computeBillableAlignedMbaTotalExGst({
        deliveryMonths: deliveryMonths as unknown as Record<string, unknown>[],
        billingMonths: billingMonths as unknown as Record<string, unknown>[],
        version,
      })
      const clientFull = roundMoney2(
        (billingMonths.length ? billingMonths : deliveryMonths).reduce(
          (s, m) => s + monthExGstFromScheduleEntry(m as unknown as Record<string, unknown>),
          0
        )
      )
      if (Math.abs(clientFull - aligned) > 0.01) {
        deltas.push({
          lineItemId: "*",
          field: "campaign_total",
          clientTotal: clientFull,
          serverTotal: aligned,
          delta: roundMoney2(clientFull - aligned),
          label: "Campaign total",
        })
      }
    }

    if (deltas.length === 0) continue
    violationCampaigns++
    for (const d of deltas) {
      csvRows.push({
        mba_number: mba,
        version_number: vn,
        campaign_status: status,
        line: d.lineItemId,
        component: d.field,
        client_total: d.clientTotal.toFixed(2),
        server_total: d.serverTotal.toFixed(2),
        delta: d.delta.toFixed(2),
        label: d.label ?? "",
      })
    }
  }

  const header = [
    "mba_number",
    "version_number",
    "campaign_status",
    "line",
    "component",
    "client_total",
    "server_total",
    "delta",
    "label",
  ]
  const lines = [
    header.join(","),
    ...csvRows.map((r) =>
      [
        r.mba_number,
        r.version_number,
        r.campaign_status,
        r.line,
        r.component,
        r.client_total,
        r.server_total,
        r.delta,
        r.label,
      ]
        .map((c) => csvEscape(String(c)))
        .join(",")
    ),
  ]
  const csv = lines.join("\n") + "\n"
  process.stdout.write(csv)

  const outPath = resolve(process.cwd(), "scripts/c1-fullscope-drift-report.csv")
  try {
    writeFileSync(outPath, csv, "utf8")
  } catch {
    // stdout is enough
  }

  console.error(
    `[c1-fullscope-drift-report] live_masters=${liveMasters.length} published_versions=${published.length} checked=${checked} skipped_empty=${skipped} violation_campaigns=${violationCampaigns} violation_rows=${csvRows.length}`
  )
}

main().catch((err) => {
  console.error("[c1-fullscope-drift-report] failed", err)
  process.exit(1)
})
