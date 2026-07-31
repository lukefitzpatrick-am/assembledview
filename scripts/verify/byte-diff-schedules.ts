/**
 * O2 / T4a.0 — byte-diff enriched computeCampaignFinancials vs persisted
 * legacy_schedules billing blob (month.lineItems). Report-only; no writes.
 *
 * Usage:
 *   node --import ./scripts/test-shims/register-server-only.mjs \
 *     --require ./scripts/test-shims/mock-server-only.cjs \
 *     --import tsx scripts/verify/byte-diff-schedules.ts \
 *     [--mba=krusty015:2,krusty015:3,PENFOLD020:22]
 *
 * Default targets: krusty015 v2 + v3 (tonight CLIENT saves) + first other
 * campaign version with month.lineItems.
 *
 * Writes scripts/verify/byte-diff-schedules-report.csv
 * Exit 0 always when the report completes (loud stderr on |Δ| > $0.01).
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { and, desc, eq, sql } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import {
  explodeScheduleToMonthRows,
  type ScheduleMonthInsert,
} from "@/scripts/migration/_scheduleTransform"
import { loadEnvLocal } from "@/scripts/migration/_shared"

const TOLERANCE_DOLLARS = 0.01
const TOLERANCE_CENTS = Math.round(TOLERANCE_DOLLARS * 100)

type Target = { mba: string; versionNumber: number }

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function parseTargets(argv: string[]): Target[] | null {
  const raw = argv.find((a) => a.startsWith("--mba="))?.slice(6)
  if (!raw?.trim()) return null
  return raw.split(",").map((part) => {
    const [mba, vn] = part.trim().split(":")
    const versionNumber = Number(vn)
    if (!mba || !Number.isFinite(versionNumber)) {
      throw new Error(`Bad --mba target "${part}" (expected MBA:version)`)
    }
    return { mba: mba.trim(), versionNumber }
  })
}

/**
 * Canonical join key across the three id shapes:
 * - decorated `billing-{mediaKey}::{id}` → bare id after `::`
 * - legacy descriptive (`search-Google Ads - AM-...-0`) → as-is
 * - `__service__*` synthetics → as-is
 */
export function canonicalLineItemId(raw: string): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  if (s.startsWith("__service__")) return s
  if (s.startsWith("billing-")) {
    const idx = s.indexOf("::")
    if (idx >= 0) return s.slice(idx + 2).trim() || s
  }
  return s
}

function rowKey(r: {
  lineItemId: string
  component: string
  month: string
}): string {
  return [
    canonicalLineItemId(r.lineItemId),
    r.component,
    String(r.month).slice(0, 10),
  ].join("|")
}

function billingBlobFromLegacy(legacy: unknown): unknown {
  if (!legacy || typeof legacy !== "object") return null
  const o = legacy as Record<string, unknown>
  return o.billingSchedule ?? o.billing_schedule ?? null
}

function monthsHaveLineItems(blob: unknown): boolean {
  const exploded = explodeScheduleToMonthRows(0, "billing", blob)
  if (exploded.failureReason) return false
  return exploded.rows.some((r) => !r.lineItemId.startsWith("__service__"))
}

function blobCanonicalIds(blob: unknown): Set<string> {
  const exploded = explodeScheduleToMonthRows(0, "billing", blob)
  if (exploded.failureReason) return new Set()
  const out = new Set<string>()
  for (const r of exploded.rows) {
    const id = canonicalLineItemId(r.lineItemId)
    if (id && !id.startsWith("__service__")) out.add(id)
  }
  return out
}

function overlapCount(a: Set<string>, b: Iterable<string>): number {
  let n = 0
  for (const id of b) {
    if (a.has(canonicalLineItemId(id))) n++
  }
  return n
}

function toLineInputs(
  rows: Array<{
    lineItemId: string
    channel: string
    buyType: string | null
    clientPaysForMedia: boolean | null
    budgetIncludesFees: boolean | null
    noAdserving: boolean | null
    bursts: unknown
    attrs: unknown
  }>
): LineItemInput[] {
  return rows.map((r) => {
    const attrs =
      r.attrs && typeof r.attrs === "object"
        ? (r.attrs as Record<string, unknown>)
        : {}
    const bursts = Array.isArray(r.bursts) ? r.bursts : []
    let enteredAmount =
      Number(attrs.enteredAmount ?? attrs.entered_amount ?? 0) || 0
    if (enteredAmount <= 0) {
      enteredAmount = bursts.reduce((sum, b) => {
        const budget = (b as { budget?: unknown })?.budget
        const n =
          typeof budget === "number"
            ? budget
            : Number.parseFloat(String(budget ?? "").replace(/[$,\s]/g, ""))
        return sum + (Number.isFinite(n) ? n : 0)
      }, 0)
    }
    const rateFromAttrs = Number(attrs.rate ?? 0) || 0
    const rateFromBurst =
      bursts
        .map((b) => {
          const v =
            (b as { buyAmount?: unknown; buy_amount?: unknown }).buyAmount ??
            (b as { buy_amount?: unknown }).buy_amount
          return typeof v === "number"
            ? v
            : Number.parseFloat(String(v ?? "").replace(/[$,\s]/g, ""))
        })
        .find((n) => Number.isFinite(n) && n > 0) ?? 0

    return {
      lineItemId: String(r.lineItemId).trim(),
      mediaType: String(attrs.mediaType ?? attrs.media_type ?? r.channel),
      buyType: r.buyType ?? "cpc",
      rate: rateFromAttrs || rateFromBurst,
      enteredAmount,
      budgetIncludesFees: Boolean(r.budgetIncludesFees),
      clientPaysForMedia: Boolean(r.clientPaysForMedia),
      noAdserving: r.noAdserving ?? undefined,
      feePct:
        typeof attrs.feePct === "number"
          ? attrs.feePct
          : typeof attrs.fee_pct === "number"
            ? attrs.fee_pct
            : undefined,
      bursts: bursts as LineItemInput["bursts"],
      approval: "approved",
      label: String(attrs.label ?? attrs.publisher ?? ""),
    }
  })
}

function feeLoadingFromSnapshot(fees: unknown): FeeLoading {
  if (!fees || typeof fees !== "object") return {}
  const out: FeeLoading = {}
  for (const [k, v] of Object.entries(fees as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      ;(out as Record<string, number>)[k] = v
    }
  }
  return out
}

type DiffRow = {
  mba: string
  versionNumber: number
  versionId: number
  lineItemId: string
  component: string
  month: string
  blobCents: number
  recomputeCents: number
  deltaCents: number
  deltaDollars: number
  loud: boolean
}

function diffMaps(
  mba: string,
  versionNumber: number,
  versionId: number,
  blobRows: ScheduleMonthInsert[],
  recomputeRows: ScheduleMonthInsert[]
): DiffRow[] {
  const blob = new Map<string, ScheduleMonthInsert>()
  const recom = new Map<string, ScheduleMonthInsert>()
  for (const r of blobRows) blob.set(rowKey(r), r)
  for (const r of recomputeRows) recom.set(rowKey(r), r)
  const keys = new Set([...blob.keys(), ...recom.keys()])
  const out: DiffRow[] = []
  for (const key of [...keys].sort()) {
    const [lineItemId, component, month] = key.split("|")
    const b = blob.get(key)
    const c = recom.get(key)
    const blobCents = Number(b?.amountCents ?? 0) || 0
    const recomputeCents = Number(c?.amountCents ?? 0) || 0
    const deltaCents = recomputeCents - blobCents
    const loud = Math.abs(deltaCents) > TOLERANCE_CENTS
    out.push({
      mba,
      versionNumber,
      versionId,
      lineItemId: lineItemId ?? "",
      component: component ?? "",
      month: month ?? "",
      blobCents,
      recomputeCents,
      deltaCents,
      deltaDollars: deltaCents / 100,
      loud,
    })
  }
  return out
}

async function resolveDefaultTargets(): Promise<Target[]> {
  const db = getDb()
  const targets: Target[] = [
    { mba: "krusty015", versionNumber: 2 },
    { mba: "krusty015", versionNumber: 3 },
  ]

  const recent = await db.execute(sql`
    SELECT v.id, v.version_number, m.mba_number, v.legacy_schedules,
           (SELECT COUNT(*)::int FROM line_items li WHERE li.version_id = v.id) AS line_count,
           (SELECT coalesce(array_agg(li.line_item_id), ARRAY[]::text[])
              FROM line_items li WHERE li.version_id = v.id) AS line_ids
    FROM media_plan_versions v
    JOIN media_plan_masters m ON m.id = v.master_id
    WHERE v.legacy_schedules IS NOT NULL
      AND m.mba_number NOT ILIKE 'krusty015%'
      AND v.legacy_schedules::text ILIKE '%lineItems%'
    ORDER BY v.id DESC
    LIMIT 80
  `)
  const rows = ((recent as { rows?: unknown[] }).rows ?? recent) as Array<{
    id: number | string
    version_number: number
    mba_number: string
    legacy_schedules: unknown
    line_count: number
    line_ids: string[] | null
  }>

  for (const r of rows) {
    if (Number(r.line_count) <= 0) continue
    const blob = billingBlobFromLegacy(r.legacy_schedules)
    if (!monthsHaveLineItems(blob)) continue
    const blobIds = blobCanonicalIds(blob)
    const overlap = overlapCount(blobIds, r.line_ids ?? [])
    if (overlap <= 0) continue
    targets.push({
      mba: String(r.mba_number),
      versionNumber: Number(r.version_number),
    })
    console.error(
      `[byte-diff] third campaign: ${r.mba_number} v${r.version_number} (overlap=${overlap} line ids)`
    )
    break
  }

  if (targets.length < 3) {
    console.error(
      "[byte-diff] WARNING: could not find a third non-krusty campaign with month.lineItems + line_items — running with",
      targets.length,
      "targets"
    )
  }
  return targets
}

async function loadVersion(target: Target) {
  const db = getDb()
  const [version] = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      campaignStatus: schema.mediaPlanVersions.campaignStatus,
      legacySchedules: schema.mediaPlanVersions.legacySchedules,
    })
    .from(schema.mediaPlanVersions)
    .where(
      and(
        eq(schema.mediaPlanVersions.mbaNumber, target.mba),
        eq(schema.mediaPlanVersions.versionNumber, target.versionNumber)
      )
    )
    .limit(1)
  return version ?? null
}

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[byte-diff] DATABASE_URL required")
    process.exit(1)
  }

  const argvTargets = parseTargets(process.argv.slice(2))
  const targets = argvTargets ?? (await resolveDefaultTargets())
  console.error(
    "[byte-diff] targets:",
    targets.map((t) => `${t.mba}:v${t.versionNumber}`).join(", ")
  )

  const db = getDb()
  const allDiffs: DiffRow[] = []
  const summaries: Array<{
    mba: string
    versionNumber: number
    versionId: number
    blobRows: number
    recomputeRows: number
    compared: number
    loud: number
    maxAbsDeltaDollars: number
  }> = []

  for (const target of targets) {
    const version = await loadVersion(target)
    if (!version) {
      console.error(
        `[byte-diff] LOUD: missing version ${target.mba} v${target.versionNumber}`
      )
      continue
    }

    const blob = billingBlobFromLegacy(version.legacySchedules)
    const blobExplode = explodeScheduleToMonthRows(version.id, "billing", blob)
    if (blobExplode.failureReason) {
      console.error(
        `[byte-diff] LOUD: blob explode failed ${target.mba} v${target.versionNumber}: ${blobExplode.failureReason}`
      )
      continue
    }

    const lines = await db
      .select({
        lineItemId: schema.lineItems.lineItemId,
        channel: schema.lineItems.channel,
        buyType: schema.lineItems.buyType,
        clientPaysForMedia: schema.lineItems.clientPaysForMedia,
        budgetIncludesFees: schema.lineItems.budgetIncludesFees,
        noAdserving: schema.lineItems.noAdserving,
        bursts: schema.lineItems.bursts,
        attrs: schema.lineItems.attrs,
      })
      .from(schema.lineItems)
      .where(eq(schema.lineItems.versionId, version.id))

    const [snap] = await db
      .select({ fees: schema.mbaFeeSnapshots.fees })
      .from(schema.mbaFeeSnapshots)
      .where(eq(schema.mbaFeeSnapshots.versionId, version.id))
      .limit(1)

    const feeLoading = feeLoadingFromSnapshot(snap?.fees)
    const inputs = toLineInputs(lines)
    const financials = computeCampaignFinancials(inputs, { feeLoading })
    const recomExplode = explodeScheduleToMonthRows(
      version.id,
      "billing",
      financials.billingSchedule
    )
    if (recomExplode.failureReason) {
      console.error(
        `[byte-diff] LOUD: recompute explode failed ${target.mba} v${target.versionNumber}: ${recomExplode.failureReason}`
      )
      continue
    }

    const diffs = diffMaps(
      String(version.mbaNumber),
      Number(version.versionNumber),
      version.id,
      blobExplode.rows,
      recomExplode.rows
    )
    allDiffs.push(...diffs)
    const loudRows = diffs.filter((d) => d.loud)
    const maxAbs = diffs.reduce(
      (m, d) => Math.max(m, Math.abs(d.deltaDollars)),
      0
    )
    summaries.push({
      mba: String(version.mbaNumber),
      versionNumber: Number(version.versionNumber),
      versionId: version.id,
      blobRows: blobExplode.rows.length,
      recomputeRows: recomExplode.rows.length,
      compared: diffs.length,
      loud: loudRows.length,
      maxAbsDeltaDollars: maxAbs,
    })

    if (loudRows.length > 0) {
      console.error(
        `[byte-diff] LOUD: ${target.mba} v${target.versionNumber} has ${loudRows.length} deltas > $${TOLERANCE_DOLLARS} (max |Δ|=$${maxAbs.toFixed(2)})`
      )
      for (const d of loudRows.slice(0, 12)) {
        console.error(
          `  ${d.lineItemId} ${d.component} ${d.month}: blob=$${(d.blobCents / 100).toFixed(2)} recom=$${(d.recomputeCents / 100).toFixed(2)} Δ=$${d.deltaDollars.toFixed(2)}`
        )
      }
    } else {
      console.error(
        `[byte-diff] OK: ${target.mba} v${target.versionNumber} — ${diffs.length} keys, all within $${TOLERANCE_DOLLARS}`
      )
    }
  }

  const header = [
    "mba_number",
    "version_number",
    "version_id",
    "line_item_id",
    "component",
    "month",
    "blob_cents",
    "recompute_cents",
    "delta_cents",
    "delta_dollars",
    "loud",
  ]
  const csvLines = [
    header.join(","),
    ...allDiffs.map((d) =>
      [
        csvEscape(d.mba),
        String(d.versionNumber),
        String(d.versionId),
        csvEscape(d.lineItemId),
        csvEscape(d.component),
        csvEscape(d.month),
        String(d.blobCents),
        String(d.recomputeCents),
        String(d.deltaCents),
        d.deltaDollars.toFixed(4),
        d.loud ? "1" : "0",
      ].join(",")
    ),
  ]
  const outPath = resolve(
    process.cwd(),
    "scripts/verify/byte-diff-schedules-report.csv"
  )
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, csvLines.join("\n") + "\n", "utf8")

  console.error("[byte-diff] summary", JSON.stringify(summaries, null, 2))
  console.error(`[byte-diff] csv → ${outPath} (${allDiffs.length} rows)`)
  const totalLoud = summaries.reduce((s, x) => s + x.loud, 0)
  if (totalLoud > 0) {
    console.error(
      `[byte-diff] LOUD TOTAL: ${totalLoud} row(s) exceeded $${TOLERANCE_DOLLARS} — no code changes applied`
    )
  } else {
    console.error(`[byte-diff] ALL GREEN within $${TOLERANCE_DOLLARS}`)
  }

  await closeDb()
}

main().catch(async (err) => {
  console.error("[byte-diff] fatal", err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
