/**
 * Post-ETL reconciliation gate (Prompt 3).
 *
 * Usage:
 *   npx tsx scripts/migration/recon.ts
 *
 * Writes under exports/xano/<date>/recon/:
 *   recon-report.csv
 *   parse-failures.csv (recomputed)
 *   schedule-divergence.csv (recomputed)
 *
 * Exit 1 on any 1:1 table count mismatch or money |delta| > $0.01 per MBA.
 */
import path from "path"
import { sql as dsql } from "drizzle-orm"
import { getClient, getDb, schema } from "@/db"
import {
  asInt,
  loadEnvLocal,
  newestSnapshotDir,
  readJsonl,
  readManifest,
  reconOutDir,
  writeCsv,
} from "./_shared"
import { CHANNEL_TABLES, burstBudgetSum } from "./_lineItemTransform"
import {
  explodeScheduleToMonthRows,
  sumScheduleCents,
} from "./_scheduleTransform"

const MONEY_EPS_CENTS = 1 // $0.01

/** Tables expected 1:1 Xano→Supabase (after renames; excluding dropped + plan transforms). */
const ONE_TO_ONE: Array<{ xano: string; supabase: string; table: keyof typeof schema }> = [
  { xano: "audio_site", supabase: "audio_site", table: "audioSite" },
  { xano: "bvod_site", supabase: "bvod_site", table: "bvodSite" },
  { xano: "display_site", supabase: "display_site", table: "displaySite" },
  { xano: "video_site", supabase: "video_site", table: "videoSite" },
  { xano: "tv_stations", supabase: "tv_stations", table: "tvStations" },
  { xano: "radio_stations", supabase: "radio_stations", table: "radioStations" },
  { xano: "newspapers", supabase: "newspapers", table: "newspapers" },
  { xano: "newspaper_adsizes", supabase: "newspaper_adsizes", table: "newspaperAdsizes" },
  { xano: "magazines", supabase: "magazines", table: "magazines" },
  { xano: "magazines_adsizes", supabase: "magazines_adsizes", table: "magazinesAdsizes" },
  { xano: "media_container_best_practice", supabase: "media_container_best_practice", table: "mediaContainerBestPractice" },
  { xano: "publishers", supabase: "publishers", table: "publishers" },
  { xano: "planning_audiences", supabase: "planning_audiences", table: "planningAudiences" },
  { xano: "clients", supabase: "clients", table: "clients" },
  // Codex v2 (0013): excluded from count recon — no Xano twin / postgres-native
  { xano: "clientdashboard", supabase: "clientdashboard", table: "clientdashboard" },
  { xano: "client_kpi", supabase: "client_kpi", table: "clientKpi" },
  { xano: "campaign_kpi", supabase: "campaign_kpi", table: "campaignKpi" },
  { xano: "publisher_kpi", supabase: "publisher_kpi", table: "publisherKpi" },
  { xano: "finance_billing_records", supabase: "finance_billing_records", table: "financeBillingRecords" },
  { xano: "finance_billing_line_items", supabase: "finance_billing_line_items", table: "financeBillingLineItems" },
  { xano: "finance_edits", supabase: "finance_edits", table: "financeEdits" },
  { xano: "finance_saved_views", supabase: "finance_saved_views", table: "financeSavedViews" },
  // revenue_forecast_lines / revenue_line_catalog: postgres-authoritative (forecast target cutover)
  { xano: "scope_of_work", supabase: "scope_of_work", table: "scopeOfWork" },
  { xano: "creative_asset", supabase: "creative_asset", table: "creativeAsset" },
  { xano: "pacing_orphan_fixes", supabase: "pacing_orphan_fixes", table: "pacingOrphanFixes" },
  // Codex v2 (0013): tasks* / client_notes / client_domains dropped from 1:1 recon
  { xano: "xero_contacts", supabase: "xero_contacts", table: "xeroContacts" },
  { xano: "xero_ar_invoices", supabase: "xero_ar_invoices", table: "xeroArInvoices" },
  { xano: "xero_ap_bills", supabase: "xero_ap_bills", table: "xeroApBills" },
  { xano: "xero_sync_exceptions", supabase: "xero_sync_exceptions", table: "xeroSyncExceptions" },
  { xano: "xero_sync_log", supabase: "xero_sync_log", table: "xeroSyncLog" },
  // mba_line_approvals: postgres-authoritative (excluded from ETL + hard 1:1 gate)
]

async function countTable(db: ReturnType<typeof getDb>, tableName: string): Promise<number> {
  const result = await db.execute(
    dsql.raw(`SELECT count(*)::int AS c FROM "${tableName}"`)
  )
  const rows = result as unknown as Array<{ c: number }>
  return Number(rows[0]?.c ?? 0)
}

function dollarsFromCents(cents: number): number {
  return Math.round(cents) / 100
}

async function main(): Promise<void> {
  loadEnvLocal()
  const snapshotDir = newestSnapshotDir()
  const manifest = readManifest(snapshotDir)
  const outDir = reconOutDir(snapshotDir)
  const xanoCounts = new Map(
    manifest.tables.map((t) => [t.name, t.fetched_count] as const)
  )

  console.log(`Recon against snapshot ${snapshotDir}`)
  const db = getDb()
  const sql = getClient()

  const countRows: Array<Record<string, unknown>> = []
  let countFailures = 0

  for (const entry of ONE_TO_ONE) {
    const xano = xanoCounts.get(entry.xano) ?? -1
    const sb = await countTable(db, entry.supabase)
    const ok = xano === sb
    if (!ok) countFailures++
    countRows.push({
      scope: "table",
      key: entry.supabase,
      xano_count: xano,
      supabase_count: sb,
      delta: sb - xano,
      ok,
      note: ok ? "" : "COUNT_MISMATCH",
    })
  }

  // Postgres-authoritative — report counts, never fail recon on mismatch.
  for (const key of [
    "mba_line_approvals",
    "revenue_forecast_lines",
    "revenue_line_catalog",
  ] as const) {
    const xano = xanoCounts.get(key) ?? -1
    const sb = await countTable(db, key)
    countRows.push({
      scope: "table",
      key,
      xano_count: xano,
      supabase_count: sb,
      delta: sb - xano,
      ok: true,
      note: "POSTGRES_AUTHORITATIVE — excluded from ETL truncate-reload; mismatch not a fail",
    })
  }

  // Masters: unique mba_number in Xano vs SB (may include +1 synthesized orphan)
  const masterXano = readJsonl(path.join(snapshotDir, "media_plan_master.jsonl"))
  const uniqueMba = new Set(
    masterXano.map((r) => String(r.mba_number ?? "").trim().toLowerCase()).filter(Boolean)
  )
  const masterSb = await countTable(db, "media_plan_masters")
  const masterOk = masterSb === uniqueMba.size || masterSb === uniqueMba.size + 1
  if (!masterOk) countFailures++
  countRows.push({
    scope: "table",
    key: "media_plan_masters",
    xano_count: uniqueMba.size,
    supabase_count: masterSb,
    delta: masterSb - uniqueMba.size,
    ok: masterOk,
    note: "xano_count = unique mba_number; +1 allowed for orphan synth",
  })

  // Versions: unique (mba, version_number) after collapse
  const versionXano = readJsonl(path.join(snapshotDir, "media_plan_versions.jsonl"))
  const versionKeys = new Set<string>()
  for (const v of versionXano) {
    const mba = String(v.mba_number ?? "").trim().toLowerCase()
    const vn = asInt(v.version_number)
    if (!mba || vn == null) continue
    versionKeys.add(`${mba}::${vn}`)
  }
  const versionSb = await countTable(db, "media_plan_versions")
  const versionOk = versionSb === versionKeys.size
  if (!versionOk) countFailures++
  countRows.push({
    scope: "table",
    key: "media_plan_versions",
    xano_count: versionKeys.size,
    supabase_count: versionSb,
    delta: versionSb - versionKeys.size,
    ok: versionOk,
    note: "xano_count = unique (mba_number, version_number)",
  })

  // Line items: channel sum vs SB (informational + soft — collapses expected)
  let channelSum = 0
  for (const { table } of CHANNEL_TABLES) {
    channelSum += xanoCounts.get(table) ?? 0
  }
  const liSb = await countTable(db, "line_items")
  countRows.push({
    scope: "table",
    key: "line_items",
    xano_count: channelSum,
    supabase_count: liSb,
    delta: liSb - channelSum,
    ok: true, // collapses expected; money/MBA checks are the hard gate
    note: "xano_count = sum of 20 channel tables (pre-collapse); ok always — see duplicates.csv",
  })

  const smSb = await countTable(db, "schedule_months")
  countRows.push({
    scope: "table",
    key: "schedule_months",
    xano_count: "",
    supabase_count: smSb,
    delta: "",
    ok: true,
    note: "derived from version blobs",
  })

  // Per-version money recon
  const versions = readJsonl(path.join(snapshotDir, "media_plan_versions.jsonl"))
  const lineItems = await db.select().from(schema.lineItems)
  const scheduleMonths = await db.select().from(schema.scheduleMonths)

  const linesByVersion = new Map<number, typeof lineItems>()
  for (const li of lineItems) {
    const list = linesByVersion.get(li.versionId) ?? []
    list.push(li)
    linesByVersion.set(li.versionId, list)
  }
  const schedByVersion = new Map<number, typeof scheduleMonths>()
  for (const sm of scheduleMonths) {
    const list = schedByVersion.get(sm.versionId) ?? []
    list.push(sm)
    schedByVersion.set(sm.versionId, list)
  }

  const parseFailures: Array<Record<string, unknown>> = []
  const scheduleDivergence: Array<Record<string, unknown>> = []
  const moneyRows: Array<Record<string, unknown>> = []
  let moneyFailures = 0

  // Aggregate money deltas per MBA
  const mbaDeltaCents = new Map<string, number>()

  // Per-version money recon — only kept versions (collapse duplicate mba+vn like ETL)
  const versionBest = new Map<string, (typeof versions)[0]>()
  for (const v of versions) {
    const id = asInt(v.id)
    const mba = String(v.mba_number ?? "").trim()
    const vn = asInt(v.version_number)
    if (id == null || !mba || vn == null) continue
    const key = `${mba.toLowerCase()}::${vn}`
    const prev = versionBest.get(key)
    if (!prev || id > (asInt(prev.id) ?? 0)) versionBest.set(key, v)
  }

  for (const v of versionBest.values()) {
    const id = asInt(v.id)
    if (id == null) continue
    const mba = String(v.mba_number ?? "")
    const vn = asInt(v.version_number) ?? 0
    const lines = linesByVersion.get(id) ?? []
    const stored = schedByVersion.get(id) ?? []

    let burstSum = 0
    for (const li of lines) {
      burstSum += burstBudgetSum(li.bursts)
    }
    const burstCents = Math.round(burstSum * 100)

    const billingExplode = explodeScheduleToMonthRows(id, "billing", v.billingSchedule)
    const deliveryExplode = explodeScheduleToMonthRows(id, "delivery", v.deliverySchedule)

    if (billingExplode.failureReason) {
      parseFailures.push({
        version_id: id,
        mba_number: mba,
        version_number: vn,
        basis: "billing",
        reason: billingExplode.failureReason,
      })
    }
    if (deliveryExplode.failureReason) {
      parseFailures.push({
        version_id: id,
        mba_number: mba,
        version_number: vn,
        basis: "delivery",
        reason: deliveryExplode.failureReason,
      })
    }

    const billingEmpty =
      v.billingSchedule == null ||
      v.billingSchedule === "" ||
      (Array.isArray(v.billingSchedule) && v.billingSchedule.length === 0)
    const deliveryEmpty =
      v.deliverySchedule == null ||
      v.deliverySchedule === "" ||
      (Array.isArray(v.deliverySchedule) && v.deliverySchedule.length === 0)

    if (lines.length > 0 && stored.length === 0 && billingEmpty && deliveryEmpty) {
      scheduleDivergence.push({
        version_id: id,
        mba_number: mba,
        version_number: vn,
        line_item_count: lines.length,
        reason: "line items present but both schedule blobs empty",
      })
    }

    const legacyBilling = billingExplode.failureReason ? [] : billingExplode.rows
    const legacyDelivery = deliveryExplode.failureReason ? [] : deliveryExplode.rows

    const legacyBillMedia = sumScheduleCents(legacyBilling, "media", "billing")
    const legacyBillFee = sumScheduleCents(legacyBilling, "fee", "billing")
    const legacyDelMedia = sumScheduleCents(legacyDelivery, "media", "delivery")
    const legacyDelFee = sumScheduleCents(legacyDelivery, "fee", "delivery")

    let sbBillMedia = 0
    let sbBillFee = 0
    let sbDelMedia = 0
    let sbDelFee = 0
    for (const sm of stored) {
      if (sm.basis === "billing" && sm.component === "media") sbBillMedia += sm.amountCents
      if (sm.basis === "billing" && sm.component === "fee") sbBillFee += sm.amountCents
      if (sm.basis === "delivery" && sm.component === "media") sbDelMedia += sm.amountCents
      if (sm.basis === "delivery" && sm.component === "fee") sbDelFee += sm.amountCents
    }

    const dBillMedia = sbBillMedia - legacyBillMedia
    const dBillFee = sbBillFee - legacyBillFee
    const dDelMedia = sbDelMedia - legacyDelMedia
    const dDelFee = sbDelFee - legacyDelFee

    const maxAbs = Math.max(
      Math.abs(dBillMedia),
      Math.abs(dBillFee),
      Math.abs(dDelMedia),
      Math.abs(dDelFee)
    )
    const moneyOk =
      billingExplode.failureReason != null ||
      deliveryExplode.failureReason != null
        ? true // dispositioned via parse-failures, not a hard money fail
        : maxAbs <= MONEY_EPS_CENTS

    // If both parses succeeded, hard-fail on schedule vs recomputed legacy
    if (
      !billingExplode.failureReason &&
      !deliveryExplode.failureReason &&
      maxAbs > MONEY_EPS_CENTS
    ) {
      moneyFailures++
      const prev = mbaDeltaCents.get(mba) ?? 0
      mbaDeltaCents.set(mba, prev + maxAbs)
    }

    moneyRows.push({
      scope: "mba_version",
      key: `${mba}/v${vn}`,
      version_id: id,
      mba_number: mba,
      version_number: vn,
      line_item_count: lines.length,
      burst_budget_dollars: dollarsFromCents(burstCents),
      sb_billing_media_dollars: dollarsFromCents(sbBillMedia),
      sb_billing_fee_dollars: dollarsFromCents(sbBillFee),
      sb_delivery_media_dollars: dollarsFromCents(sbDelMedia),
      sb_delivery_fee_dollars: dollarsFromCents(sbDelFee),
      legacy_billing_media_dollars: dollarsFromCents(legacyBillMedia),
      legacy_billing_fee_dollars: dollarsFromCents(legacyBillFee),
      legacy_delivery_media_dollars: dollarsFromCents(legacyDelMedia),
      legacy_delivery_fee_dollars: dollarsFromCents(legacyDelFee),
      max_abs_delta_dollars: dollarsFromCents(maxAbs),
      ok: moneyOk,
      note: moneyOk ? "" : "MONEY_DELTA",
    })
  }

  // Also fail if any MBA accumulated > $0.01
  for (const [mba, cents] of mbaDeltaCents) {
    if (cents > MONEY_EPS_CENTS) {
      countRows.push({
        scope: "mba_money",
        key: mba,
        xano_count: "",
        supabase_count: "",
        delta: dollarsFromCents(cents),
        ok: false,
        note: "MBA max schedule delta > $0.01",
      })
    }
  }

  const report = [...countRows, ...moneyRows]
  writeCsv(
    path.join(outDir, "recon-report.csv"),
    [
      "scope",
      "key",
      "version_id",
      "mba_number",
      "version_number",
      "xano_count",
      "supabase_count",
      "delta",
      "line_item_count",
      "burst_budget_dollars",
      "sb_billing_media_dollars",
      "sb_billing_fee_dollars",
      "sb_delivery_media_dollars",
      "sb_delivery_fee_dollars",
      "legacy_billing_media_dollars",
      "legacy_billing_fee_dollars",
      "legacy_delivery_media_dollars",
      "legacy_delivery_fee_dollars",
      "max_abs_delta_dollars",
      "ok",
      "note",
    ],
    report
  )

  writeCsv(
    path.join(outDir, "parse-failures.csv"),
    ["version_id", "mba_number", "version_number", "basis", "reason"],
    parseFailures
  )
  writeCsv(
    path.join(outDir, "schedule-divergence.csv"),
    ["version_id", "mba_number", "version_number", "line_item_count", "reason"],
    scheduleDivergence
  )

  console.log("\n=== Recon summary ===")
  console.log(`1:1 count mismatches: ${countFailures}`)
  console.log(`Money deltas > $0.01 (versions): ${moneyFailures}`)
  console.log(`parse-failures: ${parseFailures.length} (expect ~68)`)
  console.log(`schedule-divergence: ${scheduleDivergence.length} (expect ~49)`)
  console.log(`Report: ${path.join(outDir, "recon-report.csv")}`)

  const xanoTotal = [...xanoCounts.values()].reduce((a, b) => a + b, 0)
  console.log(`Xano manifest total rows: ${xanoTotal} (dashboard band ~28585)`)

  await sql.end({ timeout: 5 })

  if (countFailures > 0 || moneyFailures > 0) {
    console.error("\nRECON FAILED")
    process.exit(1)
  }
  console.log("\nRECON PASSED")
}

main().catch(async (err) => {
  console.error(err)
  try {
    await getClient().end({ timeout: 2 })
  } catch {
    /* ignore */
  }
  process.exit(1)
})
