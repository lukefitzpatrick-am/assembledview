/**
 * Xano snapshot → Supabase ETL (Prompt 3).
 *
 * Usage:
 *   npx tsx scripts/migration/etl-xano-to-supabase.ts
 *   npx tsx scripts/migration/etl-xano-to-supabase.ts --dry-run
 *
 * Reads newest exports/xano/<date>/, truncate-and-reloads migrated tables
 * via db/ (DATABASE_URL). Writes disposition CSVs under <snapshot>/recon/.
 */
import path from "path"
import { getTableColumns, type Table } from "drizzle-orm"
import { getClient, getDb, schema } from "@/db"
import {
  asInt,
  asText,
  chunk,
  loadEnvLocal,
  newestSnapshotDir,
  readJsonl,
  readManifest,
  reconOutDir,
  resolveClientId,
  toCents,
  tsFromXano,
  writeCsv,
  type JsonlRow,
} from "./_shared"
import {
  CHANNEL_TABLES,
  buildLineItems,
  type VersionRef,
} from "./_lineItemTransform"
import { explodeScheduleToMonthRows } from "./_scheduleTransform"

const DRY = process.argv.includes("--dry-run")
const BATCH = 250

type Pg = ReturnType<typeof getClient>

const DROPPED_XANO_TABLES = new Set([
  "xero_invoices",
  "media_plan_monthly_lines",
  "user",
  // channel + master/versions handled by plan_core transform
  ...CHANNEL_TABLES.map((c) => c.table),
  "media_plan_master",
  "media_plan_versions",
])

/**
 * Postgres-authoritative tables: never truncate-reload from Xano.
 * Writes follow WRITE_BACKEND=postgres with no Xano mirror; a reload would
 * destroy live exclusions (PC0 / X1 design gap).
 */
const POSTGRES_AUTHORITATIVE_TABLES = new Set([
  "mba_line_approvals",
  /** Forecast target store cutover — app writes PG; ETL must not wipe. */
  "revenue_forecast_lines",
  "revenue_line_catalog",
  // Codex v2 (migration 0013): Postgres-native module, no Xano twin.
  // NEVER truncate-reload these — reloading would destroy live Codex data:
  // tasks, task_checklist_items, task_comments, task_templates, task_template_items,
  // client_notes, client_domains
  "tasks",
  "task_checklist_items",
  "task_comments",
  "task_templates",
  "task_template_items",
  "client_notes",
  "client_domains",
])

/** Xano JSONL key → SQL column renames (per table). */
const RENAMES: Record<string, Record<string, string>> = {
  finance_saved_views: { user: "user_id" },
  clientdashboard: { Client_dashboard: "client_dashboard" },
}

const CHANNEL_FLAG_KEYS: Array<[string, string]> = [
  ["mp_television", "television"],
  ["mp_radio", "radio"],
  ["mp_cinema", "cinema"],
  ["mp_newspaper", "newspaper"],
  ["mp_magazines", "magazines"],
  ["mp_ooh", "ooh"],
  ["mp_progdisplay", "prog_display"],
  ["mp_progvideo", "prog_video"],
  ["mp_progaudio", "prog_audio"],
  ["mp_progbvod", "prog_bvod"],
  ["mp_progooh", "prog_ooh"],
  ["mp_digidisplay", "digi_display"],
  ["mp_digivideo", "digi_video"],
  ["mp_digiaudio", "digi_audio"],
  ["mp_bvod", "digi_bvod"],
  ["mp_socialmedia", "social"],
  ["mp_search", "search"],
  ["mp_influencers", "influencers"],
  ["mp_integration", "integrations"],
  ["mp_production", "production"],
]

function sqlColumnNames(table: Table): Map<string, { jsKey: string; dataType: string }> {
  const cols = getTableColumns(table)
  const map = new Map<string, { jsKey: string; dataType: string }>()
  for (const [jsKey, col] of Object.entries(cols)) {
    map.set(col.name, { jsKey, dataType: col.dataType })
  }
  return map
}

function coerceValue(
  dataType: string,
  sqlName: string,
  val: unknown
): unknown {
  if (val === undefined) return undefined
  if (val === null) return null

  if (sqlName === "abn") return String(val)

  const looksTemporal =
    sqlName.endsWith("_at") ||
    sqlName.endsWith("_date") ||
    sqlName.endsWith("_utc") ||
    sqlName.includes("timestamp") ||
    sqlName.includes("watermark") ||
    sqlName === "meeting_date" ||
    sqlName === "synced_at"

  if (dataType === "date" || (looksTemporal && (sqlName.endsWith("_date") || sqlName === "invoice_date" || sqlName === "scope_date"))) {
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10)
    }
    const iso = tsFromXano(val)
    return iso ? iso.slice(0, 10) : null
  }

  if (looksTemporal || (dataType === "string" && looksTemporal)) {
    const iso = tsFromXano(val)
    if (iso) return iso
  }

  // Xano often stores epoch-ms in timestamp fields — convert large ints on temporal-ish names
  if (
    typeof val === "number" &&
    Number.isFinite(val) &&
    val > 1_000_000_000_000 &&
    (looksTemporal || dataType === "string")
  ) {
    const iso = tsFromXano(val)
    if (iso) return iso
  }

  if (dataType === "json") {
    if (val === "" || val === "null") return null
    if (typeof val === "string") {
      const t = val.trim()
      if (!t) return null
      try {
        JSON.parse(t) // validate
        return t
      } catch {
        return null
      }
    }
    return val
  }

  if (dataType === "boolean") {
    if (typeof val === "boolean") return val
    if (typeof val === "number") return val !== 0
    return Boolean(val)
  }

  if (dataType === "number") {
    if (typeof val === "number" && Number.isFinite(val)) return val
    if (typeof val === "string" && val.trim() !== "") {
      const n = Number(val)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  // string / numeric-as-string columns
  if (typeof val === "object") return JSON.stringify(val)
  if (typeof val === "number" || typeof val === "boolean") return String(val)
  return val
}

function mapPortedRow(
  table: Table,
  row: JsonlRow,
  tableName: string
): Record<string, unknown> | null {
  const cols = sqlColumnNames(table)
  const renames = RENAMES[tableName] ?? {}
  const reverse = new Map<string, string>()
  for (const [from, to] of Object.entries(renames)) reverse.set(to, from)

  const out: Record<string, unknown> = {}
  let hasId = false

  for (const [sqlName, meta] of cols) {
    const xanoKey = reverse.get(sqlName) ?? sqlName
    if (!(xanoKey in row) && !(sqlName in row)) continue
    const raw = xanoKey in row ? row[xanoKey] : row[sqlName]
    const coerced = coerceValue(meta.dataType, sqlName, raw)
    if (coerced === undefined) continue
    out[sqlName] = coerced
    if (sqlName === "id" && coerced != null) hasId = true
  }

  // created_at from Xano ms
  if (cols.has("created_at") && out.created_at == null && row.created_at != null) {
    out.created_at = tsFromXano(row.created_at)
  }

  // finance_billing_records: Xano `billed_amount` (dollars) → `billed_amount_cents`
  if (tableName === "finance_billing_records" && cols.has("billed_amount_cents")) {
    if (out.billed_amount_cents == null && row.billed_amount != null) {
      const dollars =
        typeof row.billed_amount === "number"
          ? row.billed_amount
          : typeof row.billed_amount === "string"
            ? Number(row.billed_amount)
            : NaN
      if (Number.isFinite(dollars)) {
        out.billed_amount_cents = Math.round(dollars * 100)
      }
    }
    if (out.billed_lines_hash == null && row.billed_lines_hash != null) {
      out.billed_lines_hash =
        typeof row.billed_lines_hash === "string"
          ? row.billed_lines_hash
          : String(row.billed_lines_hash)
    }
  }

  if (!hasId) return null
  return out
}

async function truncateTables(sql: Pg, tables: string[]): Promise<void> {
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t}"`).join(", ")
  await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

async function insertRows(
  sql: Pg,
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0
  let n = 0
  for (const batch of chunk(rows, BATCH)) {
    const allKeys = new Set<string>()
    for (const r of batch) for (const k of Object.keys(r)) allKeys.add(k)
    const keyList = [...allKeys]
    const uniform = batch.map((r) => {
      const o: Record<string, unknown> = {}
      for (const k of keyList) {
        const v = r[k] ?? null
        // postgres.js bulk insert cannot bind raw Objects — serialize JSON/jsonb
        if (v !== null && typeof v === "object" && !(v instanceof Date)) {
          o[k] = JSON.stringify(v)
        } else if (v === "") {
          // empty string is invalid for jsonb — use null
          o[k] = null
        } else {
          o[k] = v
        }
      }
      return o
    })
    await sql`INSERT INTO ${sql(tableName)} ${sql(uniform)}`
    n += uniform.length
  }
  return n
}

async function family(
  sql: Pg,
  label: string,
  fn: (tx: Pg) => Promise<void>
): Promise<void> {
  console.log(`\n=== Family: ${label} ===`)
  if (DRY) {
    await fn(sql)
    return
  }
  await sql.begin(async (tx) => {
    await fn(tx as unknown as Pg)
  })
}

async function main(): Promise<void> {
  loadEnvLocal()
  const snapshotDir = newestSnapshotDir()
  const manifest = readManifest(snapshotDir)
  const outDir = reconOutDir(snapshotDir)
  console.log(`Snapshot: ${snapshotDir}`)
  console.log(`Exported at: ${manifest.exported_at}`)
  console.log(`Tables in manifest: ${manifest.table_count}`)
  if (DRY) console.log("DRY RUN — no writes")

  const sql = getClient()
  // Touch drizzle so schema is loaded
  getDb()

  // ---------- reference ----------
  await family(sql, "reference", async (tx) => {
    const tables: Array<[string, Table]> = [
      ["audio_site", schema.audioSite],
      ["bvod_site", schema.bvodSite],
      ["display_site", schema.displaySite],
      ["video_site", schema.videoSite],
      ["tv_stations", schema.tvStations],
      ["radio_stations", schema.radioStations],
      ["newspapers", schema.newspapers],
      ["newspaper_adsizes", schema.newspaperAdsizes],
      ["magazines", schema.magazines],
      ["magazines_adsizes", schema.magazinesAdsizes],
      ["media_container_best_practice", schema.mediaContainerBestPractice],
      ["publishers", schema.publishers],
      ["planning_audiences", schema.planningAudiences],
    ]
    if (!DRY) await truncateTables(tx, tables.map(([n]) => n))
    for (const [name, table] of tables) {
      const rows = readJsonl(path.join(snapshotDir, `${name}.jsonl`))
        .map((r) => mapPortedRow(table, r, name))
        .filter((r): r is Record<string, unknown> => r != null)
      if (DRY) console.log(`  [dry-run] ${name}: ${rows.length}`)
      else console.log(`  ${name}: ${await insertRows(tx, name, rows)}`)
    }
  })

  // ---------- clients ----------
  // T2a.1: website / social URLs / client_brain* are on schema.clients — mapPortedRow
  // ports them verbatim (brain as text; client_brain_updated_at via temporal coerce).
  const clientRows = readJsonl(path.join(snapshotDir, "clients.jsonl"))
  await family(sql, "clients", async (tx) => {
    const tables: Array<[string, Table]> = [
      ["clients", schema.clients],
      // Codex v2 (migration 0013): Postgres-native module, no Xano twin.
      // NEVER truncate-reload these — reloading would destroy live Codex data:
      // tasks, task_checklist_items, task_comments, task_templates, task_template_items,
      // client_notes, client_domains
      ["clientdashboard", schema.clientdashboard],
      ["client_kpi", schema.clientKpi],
    ]
    if (!DRY) await truncateTables(tx, tables.map(([n]) => n))
    for (const [name, table] of tables) {
      const rows = readJsonl(path.join(snapshotDir, `${name}.jsonl`))
        .map((r) => mapPortedRow(table, r, name))
        .filter((r): r is Record<string, unknown> => r != null)
      if (DRY) console.log(`  [dry-run] ${name}: ${rows.length}`)
      else console.log(`  ${name}: ${await insertRows(tx, name, rows)}`)
    }
  })

  // ---------- plan_core ----------
  const masterRows = readJsonl(path.join(snapshotDir, "media_plan_master.jsonl"))
  const versionRows = readJsonl(path.join(snapshotDir, "media_plan_versions.jsonl"))
  const feeSnapRows = readJsonl(path.join(snapshotDir, "mba_fee_snapshots.jsonl"))
  const overrideRows = readJsonl(path.join(snapshotDir, "billing_overrides.jsonl"))

  const versionsById = new Map<number, VersionRef>()
  const versionsByMba = new Map<string, VersionRef[]>()
  for (const v of versionRows) {
    const id = asInt(v.id)
    const mba = String(v.mba_number ?? "").trim()
    const vn = asInt(v.version_number)
    if (id == null || !mba || vn == null) continue
    const ref: VersionRef = { id, mbaNumber: mba, versionNumber: vn }
    versionsById.set(id, ref)
    const key = mba.toLowerCase()
    const list = versionsByMba.get(key) ?? []
    list.push(ref)
    versionsByMba.set(key, list)
  }

  // Masters: one row per mba_number (Xano master is per-MBA with published version_number)
  const mastersByMba = new Map<string, JsonlRow>()
  for (const m of masterRows) {
    const mba = String(m.mba_number ?? "").trim()
    if (!mba) continue
    // Prefer highest id if duplicates
    const prev = mastersByMba.get(mba.toLowerCase())
    if (!prev || (asInt(m.id) ?? 0) > (asInt(prev.id) ?? 0)) {
      mastersByMba.set(mba.toLowerCase(), m)
    }
  }

  const parseFailures: Array<Record<string, unknown>> = []
  const scheduleDivergence: Array<Record<string, unknown>> = []

  await family(sql, "plan_core", async (tx) => {
    if (!DRY) {
      await truncateTables(tx, [
        "schedule_months",
        "line_items",
        "billing_overrides",
        "mba_fee_snapshots",
        "media_plan_versions",
        "media_plan_masters",
      ])
    }

    // 1. Masters (without published_version_id first)
    const masterInserts: Record<string, unknown>[] = []
    for (const m of mastersByMba.values()) {
      const id = asInt(m.id)
      if (id == null) continue
      const mba = String(m.mba_number ?? "")
      const clientId = resolveClientId(asText(m.mp_client_name), clientRows)
      const budget = m.mp_campaignbudget
      let budgetCents: number | null = null
      if (typeof budget === "number" && Number.isFinite(budget)) {
        budgetCents = toCents(budget)
      }
      masterInserts.push({
        id,
        created_at: tsFromXano(m.created_at) ?? new Date().toISOString(),
        mba_number: mba,
        client_id: clientId,
        mp_client_name: asText(m.mp_client_name),
        campaign_name: asText(m.mp_campaignname),
        campaign_status: asText(m.campaign_status),
        campaign_start_date:
          typeof m.campaign_start_date === "string"
            ? m.campaign_start_date.slice(0, 10)
            : null,
        campaign_end_date:
          typeof m.campaign_end_date === "string"
            ? m.campaign_end_date.slice(0, 10)
            : null,
        campaign_budget_cents: budgetCents,
        published_version_id: null,
      })
    }
    if (DRY) console.log(`  [dry-run] media_plan_masters: ${masterInserts.length}`)
    else console.log(`  media_plan_masters: ${await insertRows(tx, "media_plan_masters", masterInserts)}`)

    const masterIdByMba = new Map<string, number>()
    for (const m of masterInserts) {
      masterIdByMba.set(String(m.mba_number).toLowerCase(), m.id as number)
    }

    // 2. Versions — collapse duplicate (mba, version_number) to highest Xano id
    const versionBest = new Map<string, JsonlRow>()
    const versionDupes: Array<Record<string, unknown>> = []
    for (const v of versionRows) {
      const id = asInt(v.id)
      const mba = String(v.mba_number ?? "").trim()
      const vn = asInt(v.version_number)
      if (id == null || !mba || vn == null) continue
      const key = `${mba.toLowerCase()}::${vn}`
      const prev = versionBest.get(key)
      if (!prev) {
        versionBest.set(key, v)
        continue
      }
      const prevId = asInt(prev.id) ?? 0
      if (id > prevId) {
        versionDupes.push({
          mba_number: mba,
          version_number: vn,
          kept_id: id,
          dropped_id: prevId,
        })
        versionBest.set(key, v)
      } else {
        versionDupes.push({
          mba_number: mba,
          version_number: vn,
          kept_id: prevId,
          dropped_id: id,
        })
      }
    }
    writeCsv(
      path.join(outDir, "version-duplicates.csv"),
      ["mba_number", "version_number", "kept_id", "dropped_id"],
      versionDupes
    )

    const versionInserts: Record<string, unknown>[] = []
    for (const v of versionBest.values()) {
      const id = asInt(v.id)
      const mba = String(v.mba_number ?? "").trim()
      const vn = asInt(v.version_number)
      if (id == null || !mba || vn == null) continue
      let masterId = masterIdByMba.get(mba.toLowerCase())
      if (masterId == null) {
        // Orphan version — synthesize master from version row
        masterId = id + 10_000_000
        if (!DRY) {
          await insertRows(tx, "media_plan_masters", [
            {
              id: masterId,
              created_at: tsFromXano(v.created_at) ?? new Date().toISOString(),
              mba_number: mba,
              client_id: resolveClientId(asText(v.mp_client_name), clientRows),
              mp_client_name: asText(v.mp_client_name),
              campaign_name: asText(v.campaign_name),
              campaign_status: asText(v.campaign_status),
              campaign_start_date:
                typeof v.campaign_start_date === "string"
                  ? v.campaign_start_date.slice(0, 10)
                  : null,
              campaign_end_date:
                typeof v.campaign_end_date === "string"
                  ? v.campaign_end_date.slice(0, 10)
                  : null,
              campaign_budget_cents:
                typeof v.mp_campaignbudget === "number"
                  ? toCents(v.mp_campaignbudget)
                  : null,
              published_version_id: null,
            },
          ])
        }
        masterIdByMba.set(mba.toLowerCase(), masterId)
        console.warn(`  synthesized master ${masterId} for orphan MBA ${mba}`)
      }

      const flags: Record<string, boolean> = {}
      for (const [xanoKey, channel] of CHANNEL_FLAG_KEYS) {
        if (v[xanoKey] != null) flags[channel] = Boolean(v[xanoKey])
      }

      versionInserts.push({
        id,
        created_at: tsFromXano(v.created_at) ?? new Date().toISOString(),
        master_id: masterId,
        version_number: vn,
        mba_number: mba,
        campaign_name: asText(v.campaign_name),
        campaign_status: asText(v.campaign_status),
        campaign_start_date:
          typeof v.campaign_start_date === "string"
            ? v.campaign_start_date.slice(0, 10)
            : null,
        campaign_end_date:
          typeof v.campaign_end_date === "string"
            ? v.campaign_end_date.slice(0, 10)
            : null,
        brand: asText(v.brand),
        client_contact: asText(v.client_contact),
        po_number: asText(v.po_number),
        campaign_budget_cents:
          typeof v.mp_campaignbudget === "number"
            ? toCents(v.mp_campaignbudget)
            : null,
        fixed_fee: typeof v.fixed_fee === "boolean" ? v.fixed_fee : null,
        channel_flags: flags,
        legacy_schedules: {
          billingSchedule: v.billingSchedule ?? null,
          deliverySchedule: v.deliverySchedule ?? null,
        },
        media_plan_file: v.media_plan ?? null,
        mba_pdf_file: v.mba_pdf ?? null,
        aa_media_plan_file: v.aa_media_plan ?? null,
      })
    }
    console.log(
      `  versions kept=${versionInserts.length} collapsed=${versionDupes.length}`
    )
    if (DRY) console.log(`  [dry-run] media_plan_versions: ${versionInserts.length}`)
    else console.log(`  media_plan_versions: ${await insertRows(tx, "media_plan_versions", versionInserts)}`)

    // Rebuild version indexes from kept set (line items / schedules must not point at dropped ids)
    versionsById.clear()
    versionsByMba.clear()
    for (const v of versionInserts) {
      const id = v.id as number
      const mba = String(v.mba_number)
      const vn = v.version_number as number
      const ref: VersionRef = { id, mbaNumber: mba, versionNumber: vn }
      versionsById.set(id, ref)
      const key = mba.toLowerCase()
      const list = versionsByMba.get(key) ?? []
      list.push(ref)
      versionsByMba.set(key, list)
    }

    // Remap line-item version_ids that pointed at collapsed-away versions.
    // Chains are resolved transitively in resolveRemappedVersionId.
    const versionRemap = new Map<number, number>()
    for (const d of versionDupes) {
      versionRemap.set(d.dropped_id as number, d.kept_id as number)
    }

    // 3. published_version_id on masters
    if (!DRY) {
      for (const m of mastersByMba.values()) {
        const mba = String(m.mba_number ?? "")
        const vn = asInt(m.version_number)
        const masterId = asInt(m.id)
        if (!mba || vn == null || masterId == null) continue
        const ver = (versionsByMba.get(mba.toLowerCase()) ?? []).find(
          (x) => x.versionNumber === vn
        )
        if (!ver) continue
        await tx`
          UPDATE media_plan_masters
          SET published_version_id = ${ver.id}
          WHERE id = ${masterId}
        `
      }
    }

    // 4. Line items
    const channelRows = CHANNEL_TABLES.map(({ table, channel }) => ({
      channel,
      rows: readJsonl(path.join(snapshotDir, `${table}.jsonl`)),
    }))
    const built = buildLineItems({
      channelRows,
      versionsById,
      versionsByMba,
      versionRemap,
    })
    writeCsv(
      path.join(outDir, "duplicates.csv"),
      [
        "version_id",
        "mba_number",
        "line_item_id",
        "channel",
        "kept_id",
        "dropped_ids",
        "dropped_budget_sum",
      ],
      built.duplicates
    )
    writeCsv(
      path.join(outDir, "production-skips.csv"),
      ["xano_id", "mba_number", "mp_plannumber", "reason"],
      built.skips
    )
    console.log(
      `  line_items raw=${built.rawRowCount} inserts=${built.inserts.length} duplicates=${built.duplicates.length} skips=${built.skips.length}`
    )

    const liRows = built.inserts.map((li) => ({
      version_id: li.versionId,
      channel: li.channel,
      line_item_id: li.lineItemId,
      position: li.position,
      market: li.market,
      buying_demo: li.buyingDemo,
      buy_type: li.buyType,
      publisher: li.publisher,
      platform: li.platform,
      bid_strategy: li.bidStrategy,
      fixed_cost_media: li.fixedCostMedia,
      client_pays_for_media: li.clientPaysForMedia,
      budget_includes_fees: li.budgetIncludesFees,
      no_adserving: li.noAdserving,
      bursts: li.bursts,
      attrs: li.attrs,
    }))
    if (!DRY) console.log(`  line_items: ${await insertRows(tx, "line_items", liRows)}`)

    // 5. schedule_months from version blobs
    const allScheduleRows: Record<string, unknown>[] = []
    const lineCountByVersion = new Map<number, number>()
    for (const li of built.inserts) {
      lineCountByVersion.set(
        li.versionId,
        (lineCountByVersion.get(li.versionId) ?? 0) + 1
      )
    }

    for (const v of versionBest.values()) {
      const id = asInt(v.id)
      if (id == null) continue
      const mba = String(v.mba_number ?? "")
      const vn = asInt(v.version_number) ?? 0

      for (const basis of ["billing", "delivery"] as const) {
        const raw =
          basis === "billing" ? v.billingSchedule : v.deliverySchedule
        const result = explodeScheduleToMonthRows(id, basis, raw)
        if (result.failureReason) {
          parseFailures.push({
            version_id: id,
            mba_number: mba,
            version_number: vn,
            basis,
            reason: result.failureReason,
          })
          continue
        }
        for (const r of result.rows) {
          allScheduleRows.push({
            version_id: r.versionId,
            line_item_id: r.lineItemId,
            component: r.component,
            basis: r.basis,
            month: r.month,
            amount_cents: r.amountCents,
            source: r.source,
          })
        }
      }

      const hasLines = (lineCountByVersion.get(id) ?? 0) > 0
      const scheduleForVersion = allScheduleRows.filter(
        (r) => r.version_id === id
      )
      const billingEmpty =
        v.billingSchedule == null ||
        v.billingSchedule === "" ||
        (Array.isArray(v.billingSchedule) && v.billingSchedule.length === 0)
      const deliveryEmpty =
        v.deliverySchedule == null ||
        v.deliverySchedule === "" ||
        (Array.isArray(v.deliverySchedule) && v.deliverySchedule.length === 0)

      if (hasLines && scheduleForVersion.length === 0 && billingEmpty && deliveryEmpty) {
        scheduleDivergence.push({
          version_id: id,
          mba_number: mba,
          version_number: vn,
          line_item_count: lineCountByVersion.get(id) ?? 0,
          reason: "line items present but both schedule blobs empty",
        })
      }
    }

    if (DRY) console.log(`  [dry-run] schedule_months: ${allScheduleRows.length}`)
    else console.log(`  schedule_months: ${await insertRows(tx, "schedule_months", allScheduleRows)}`)

    // 6. mba_fee_snapshots
    const feeInserts: Record<string, unknown>[] = []
    for (const f of feeSnapRows) {
      const versionId = asInt(f.media_plan_version ?? f.version_id ?? f.media_plan_version_id)
      if (versionId == null || !versionsById.has(versionId)) continue
      feeInserts.push({
        id: asInt(f.id),
        created_at: tsFromXano(f.created_at) ?? new Date().toISOString(),
        version_id: versionId,
        fees: f.fees ?? f,
        captured_at: tsFromXano(f.captured_at ?? f.created_at) ?? new Date().toISOString(),
      })
    }
    if (DRY) console.log(`  [dry-run] mba_fee_snapshots: ${feeInserts.length}`)
    else console.log(`  mba_fee_snapshots: ${await insertRows(tx, "mba_fee_snapshots", feeInserts.filter(r => r.id != null))}`)

    // 7. billing_overrides
    const ovInserts: Record<string, unknown>[] = []
    for (const o of overrideRows) {
      const versionId = asInt(o.media_plan_version ?? o.version_id)
      if (versionId == null || !versionsById.has(versionId)) continue
      const component = String(o.component ?? "media").toLowerCase()
      if (component !== "media" && component !== "fee") continue
      ovInserts.push({
        id: asInt(o.id),
        created_at: tsFromXano(o.created_at) ?? new Date().toISOString(),
        version_id: versionId,
        line_item_id: String(o.line_item_id ?? ""),
        component,
        mode: asText(o.mode) ?? "manual",
        reason: asText(o.reason),
        months: o.months ?? null,
        date_basis: asText(o.date_basis),
      })
    }
    if (DRY) console.log(`  [dry-run] billing_overrides: ${ovInserts.length}`)
    else console.log(`  billing_overrides: ${await insertRows(tx, "billing_overrides", ovInserts.filter(r => r.id != null && r.line_item_id))}`)
  })

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
  console.log(`\nDisposition:`)
  console.log(`  parse-failures.csv: ${parseFailures.length} (expect ~68)`)
  console.log(`  schedule-divergence.csv: ${scheduleDivergence.length} (expect ~49)`)
  console.log(`  duplicates.csv written under ${outDir}`)

  // ---------- kpi / finance / tasks / xero ----------
  await family(sql, "kpi_finance_tasks_xero", async (tx) => {
    const tables: Array<[string, Table]> = [
      ["campaign_kpi", schema.campaignKpi],
      ["publisher_kpi", schema.publisherKpi],
      ["finance_billing_records", schema.financeBillingRecords],
      ["finance_billing_line_items", schema.financeBillingLineItems],
      ["finance_edits", schema.financeEdits],
      ["finance_saved_views", schema.financeSavedViews],
      ["revenue_forecast_lines", schema.revenueForecastLines],
      ["revenue_line_catalog", schema.revenueLineCatalog],
      ["scope_of_work", schema.scopeOfWork],
      ["creative_asset", schema.creativeAsset],
      ["pacing_orphan_fixes", schema.pacingOrphanFixes],
      // Codex seven excluded via POSTGRES_AUTHORITATIVE_TABLES (0013) — listed for skip log only:
      ["task_templates", schema.taskTemplates],
      ["task_template_items", schema.taskTemplateItems],
      ["tasks", schema.tasks],
      ["task_checklist_items", schema.taskChecklistItems],
      ["task_comments", schema.taskComments],
      ["xero_contacts", schema.xeroContacts],
      ["xero_ar_invoices", schema.xeroArInvoices],
      ["xero_ap_bills", schema.xeroApBills],
      ["xero_sync_exceptions", schema.xeroSyncExceptions],
      ["xero_sync_log", schema.xeroSyncLog],
      ["mba_line_approvals", schema.mbaLineApprovals],
    ]
    const reloadable = tables.filter(
      ([name]) => !POSTGRES_AUTHORITATIVE_TABLES.has(name)
    )
    if (!DRY) await truncateTables(tx, reloadable.map(([n]) => n))
    for (const [name, table] of tables) {
      if (DROPPED_XANO_TABLES.has(name)) continue
      if (POSTGRES_AUTHORITATIVE_TABLES.has(name)) {
        console.log(
          `  ${name}: SKIPPED (postgres-authoritative — not truncate-reloaded)`
        )
        continue
      }
      const rows = readJsonl(path.join(snapshotDir, `${name}.jsonl`))
        .map((r) => mapPortedRow(table, r, name))
        .filter((r): r is Record<string, unknown> => r != null)
      if (DRY) console.log(`  [dry-run] ${name}: ${rows.length}`)
      else console.log(`  ${name}: ${await insertRows(tx, name, rows)}`)
    }
  })

  if (!DRY) {
    console.log("\n=== Sync identity sequences ===")
    const seqTables = [
      "clients",
      "publishers",
      "media_plan_masters",
      "media_plan_versions",
      "line_items",
      "schedule_months",
      "mba_fee_snapshots",
      "billing_overrides",
      "campaign_kpi",
      "finance_billing_records",
      "finance_billing_line_items",
      "finance_edits",
      "xero_ar_invoices",
      "xero_ap_bills",
      "xero_contacts",
      "xero_sync_exceptions",
      "xero_sync_log",
      // tasks: Codex v2 postgres-authoritative — sequence left untouched
      "creative_asset",
      "scope_of_work",
      // mba_line_approvals: postgres-authoritative — sequence left untouched
    ]
    for (const t of seqTables) {
      await sql.unsafe(`
        SELECT setval(
          pg_get_serial_sequence('${t}', 'id'),
          COALESCE((SELECT MAX(id) FROM "${t}"), 1),
          true
        )
      `)
    }
  }

  console.log("\nETL complete.")
  if (!DRY) {
    console.log("Next: npx tsx scripts/migration/recon.ts")
  }
  await sql.end({ timeout: 5 })
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
