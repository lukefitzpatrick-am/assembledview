/**
 * PC2 — C1 full-scope drift: schedule_months (billing) vs approved_slice
 * (backfill-from-current-approvals when slice missing). Report-only.
 *
 * Usage: npx tsx scripts/c1-fullscope-drift.ts [--mba=PENFOLD001]
 * Writes scripts/c1-fullscope-drift-report.csv
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { and, eq, isNotNull } from "drizzle-orm"
import { closeDb, getDb, schema } from "@/db"
import { computeApprovedSlice, type ApprovedSlice } from "@/lib/finance/approvedSlice"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import {
  computeCampaignFinancials,
  normaliseScheduleMediaType,
} from "@/lib/finance/computeCampaignFinancials"
import {
  evaluateFullScopeGate,
  sumBillingScheduleFullScopeCents,
} from "@/lib/finance/fullScopeGate"
import type { ScheduleMonthInsert } from "@/scripts/migration/_scheduleTransform"

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
    /* optional */
  }
}

function isSlice(v: unknown): v is ApprovedSlice {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as ApprovedSlice).totalCents === "number" &&
    Array.isArray((v as ApprovedSlice).lines)
  )
}

function toLineInputs(
  rows: Array<{
    lineItemId: string
    channel: string
    buyType: string | null
    clientPaysForMedia: boolean | null
    budgetIncludesFees: boolean | null
    bursts: unknown
    attrs: unknown
  }>,
  approvalByLine: Map<string, "approved" | "excluded">
): LineItemInput[] {
  return rows.map((r) => {
    const attrs =
      r.attrs && typeof r.attrs === "object" ? (r.attrs as Record<string, unknown>) : {}
    return {
      lineItemId: r.lineItemId,
      mediaType: String(attrs.mediaType ?? attrs.media_type ?? r.channel),
      buyType: r.buyType ?? "cpc",
      rate: Number(attrs.rate ?? 0) || 0,
      enteredAmount: Number(attrs.enteredAmount ?? attrs.entered_amount ?? 0) || 0,
      budgetIncludesFees: Boolean(r.budgetIncludesFees),
      clientPaysForMedia: Boolean(r.clientPaysForMedia),
      feePct:
        typeof attrs.feePct === "number"
          ? attrs.feePct
          : typeof attrs.fee_pct === "number"
            ? attrs.fee_pct
            : undefined,
      bursts: (Array.isArray(r.bursts) ? r.bursts : []) as LineItemInput["bursts"],
      approval: approvalByLine.get(r.lineItemId) ?? "approved",
      label: String(attrs.label ?? ""),
    }
  })
}

async function main() {
  loadEnvLocal()
  const mbaFilter = process.argv.find((a) => a.startsWith("--mba="))?.slice(6) ?? null
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required")
    process.exit(1)
  }
  const db = getDb()

  const published = await db
    .select({
      versionId: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      campaignStatus: schema.mediaPlanVersions.campaignStatus,
      approvedSlice: schema.mediaPlanVersions.approvedSlice,
      masterStatus: schema.mediaPlanMasters.campaignStatus,
    })
    .from(schema.mediaPlanVersions)
    .innerJoin(
      schema.mediaPlanMasters,
      eq(schema.mediaPlanVersions.masterId, schema.mediaPlanMasters.id)
    )
    .where(
      and(
        isNotNull(schema.mediaPlanMasters.publishedVersionId),
        eq(schema.mediaPlanVersions.id, schema.mediaPlanMasters.publishedVersionId)
      )
    )

  const scoped = mbaFilter
    ? published.filter((r) => String(r.mbaNumber).toUpperCase() === mbaFilter.toUpperCase())
    : published
  console.error(`[c1-fullscope-drift] published versions: ${scoped.length}`)

  const csvRows: string[][] = []
  const unknownMedia: Array<{ mba: string; lineItemId: string; mediaType: string }> = []
  let driftCount = 0
  let missingSlice = 0
  let zeroSchedule = 0

  for (const v of scoped) {
    const scheduleRaw = await db
      .select()
      .from(schema.scheduleMonths)
      .where(
        and(
          eq(schema.scheduleMonths.versionId, v.versionId),
          eq(schema.scheduleMonths.basis, "billing")
        )
      )
    const scheduleRows: ScheduleMonthInsert[] = scheduleRaw.map((r) => ({
      versionId: r.versionId,
      lineItemId: r.lineItemId,
      component: r.component as ScheduleMonthInsert["component"],
      basis: "billing",
      month: String(r.month).slice(0, 10),
      amountCents: Number(r.amountCents) || 0,
      source: r.source as ScheduleMonthInsert["source"],
    }))
    if (!scheduleRows.length) {
      zeroSchedule++
      continue
    }

    let slice: ApprovedSlice | null = isSlice(v.approvedSlice) ? v.approvedSlice : null
    if (!slice) {
      missingSlice++
      const lines = await db
        .select()
        .from(schema.lineItems)
        .where(eq(schema.lineItems.versionId, v.versionId))

      let approvals: Array<{ lineItemId: string; approved: boolean }> = []
      try {
        approvals = await db
          .select({
            lineItemId: schema.mbaLineApprovals.lineItemId,
            approved: schema.mbaLineApprovals.approved,
          })
          .from(schema.mbaLineApprovals)
          .where(
            and(
              eq(schema.mbaLineApprovals.mbaNumber, String(v.mbaNumber)),
              eq(schema.mbaLineApprovals.mediaPlanVersion, Number(v.versionNumber))
            )
          )
      } catch {
        approvals = []
      }
      const approvalByLine = new Map<string, "approved" | "excluded">()
      for (const a of approvals) {
        approvalByLine.set(a.lineItemId, a.approved ? "approved" : "excluded")
      }
      for (const li of lines) {
        const attrs =
          li.attrs && typeof li.attrs === "object" ? (li.attrs as Record<string, unknown>) : {}
        const mt = String(attrs.mediaType ?? attrs.media_type ?? li.channel)
        if (normaliseScheduleMediaType(mt) == null) {
          unknownMedia.push({
            mba: String(v.mbaNumber),
            lineItemId: li.lineItemId,
            mediaType: mt,
          })
        }
      }
      slice = computeApprovedSlice({
        financials: computeCampaignFinancials(toLineInputs(lines, approvalByLine), {
          feeLoading: {} as FeeLoading,
        }),
      })
    }

    const gate = evaluateFullScopeGate({
      scheduleRows,
      approvedSlice: slice,
      mode: "log",
    })
    if (gate.ok) continue
    driftCount++
    const sched = sumBillingScheduleFullScopeCents(scheduleRows)
    const mba = String(v.mbaNumber ?? "")
    const vn = String(v.versionNumber ?? "")
    const st = String(v.campaignStatus ?? v.masterStatus ?? "")
    csvRows.push([
      mba,
      vn,
      st,
      "*",
      "total",
      String(sched.totalCents),
      String(slice.totalCents),
      String(gate.deltaCents),
      gate.message,
    ])
    for (const d of gate.drifts.filter((x) => x.component !== "total").slice(0, 40)) {
      csvRows.push([
        mba,
        vn,
        st,
        d.lineItemId ?? "*",
        d.component,
        String(d.scheduleCents),
        String(d.sliceCents),
        String(d.deltaCents),
        `${d.component}${d.lineItemId ? ` ${d.lineItemId}` : ""}`,
      ])
    }
  }

  const header = [
    "mba_number",
    "version_number",
    "campaign_status",
    "line",
    "component",
    "schedule_cents",
    "slice_cents",
    "delta_cents",
    "label",
  ]
  const outPath = resolve(process.cwd(), "scripts/c1-fullscope-drift-report.csv")
  writeFileSync(
    outPath,
    [header.join(","), ...csvRows.map((r) => r.map((c) => csvEscape(c)).join(","))].join("\n") +
      "\n",
    "utf8"
  )
  console.error(`[c1-fullscope-drift] drifted versions: ${driftCount}`)
  console.error(`[c1-fullscope-drift] missing approved_slice: ${missingSlice}`)
  console.error(`[c1-fullscope-drift] zero schedule_months: ${zeroSchedule}`)
  console.error(`[c1-fullscope-drift] csv rows: ${csvRows.length} -> ${outPath}`)
  if (unknownMedia.length) {
    console.error(`[c1-fullscope-drift] C-9 unknown media (${unknownMedia.length}):`)
    for (const u of unknownMedia.slice(0, 50)) {
      console.error(`  ${u.mba} ${u.lineItemId} mediaType=${u.mediaType}`)
    }
  }
  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
