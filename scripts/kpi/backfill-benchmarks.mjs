#!/usr/bin/env node
/**
 * Industry-benchmark backfill for campaign_kpi on published live/booked/approved plans.
 *
 * Usage:
 *   node scripts/kpi/backfill-benchmarks.mjs --client "BIC"
 *   node scripts/kpi/backfill-benchmarks.mjs --client "BIC" --client "Sinch"
 *   node scripts/kpi/backfill-benchmarks.mjs --all
 *   node scripts/kpi/backfill-benchmarks.mjs --all --apply
 *
 * Without --apply: print the rows that would be written and exit.
 * Requires campaign_kpi.target_source + benchmark_ref (0080).
 */

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import process from "node:process"
import postgres from "postgres"

const METRIC_KEYS = ["ctr", "conversion_rate", "cpv", "vtr", "frequency"]

const CHANNEL_TO_MEDIA_TYPE = {
  social: "socialmedia",
  search: "search",
  prog_video: "progvideo",
  digi_video: "digivideo",
  prog_bvod: "progbvod",
  digi_bvod: "bvod",
  prog_display: "progdisplay",
  digi_display: "digidisplay",
  prog_audio: "progaudio",
  digi_audio: "digiaudio",
}

const SEARCH_INDUSTRY = [
  { names: ["bic", "penfolds", "e&s", "e and s", "mitchelton"], ctr: 0.0828, conversion_rate: 0.0401 },
  { names: ["jayco", "lets go motorhomes", "hema"], ctr: 0.0828, conversion_rate: 0.0601 },
  { names: ["boss engineering"], ctr: 0.0556, conversion_rate: 0.1551 },
  { names: ["golf australia", "pga australia"], ctr: 0.0875, conversion_rate: 0.0769 },
  { names: ["legalsuper"], ctr: 0.0983, conversion_rate: 0.0264 },
  { names: ["hartmann", "candela", "bowel cancer"], ctr: 0.0581, conversion_rate: 0.0694 },
  { names: ["glendale"], ctr: 0.0756, conversion_rate: 0.1314 },
  { names: ["sinch", "deutz-fahr", "deutz fahr"], ctr: 0.061, conversion_rate: 0.0485 },
]

const SEARCH_FALLBACK = { ctr: 0.066, conversion_rate: 0.082 }

const BENCHMARKS = {
  "social-meta": {
    values: { ctr: 0.011, conversion_rate: 0.005, cpv: 0.04, vtr: 0.2, frequency: 2 },
    benchmark_ref:
      "CTR, CPC and ThruPlay cost are AU (WordStream AU Q1 2026, n=8,400 accounts). Conversion rate is global ecommerce, not AU. ThruPlay rate is a global 2026 range (18-25%, Reels/Stories).",
  },
  "social-tiktok": {
    values: { ctr: 0.007, conversion_rate: 0.005, cpv: null, vtr: 0.3, frequency: 2 },
    benchmark_ref: "Global 2026 (Lebesgue, DigitalApplied). No AU-specific figure.",
  },
  "social-reddit": {
    values: { ctr: 0.004, conversion_rate: 0.02, cpv: 0.15, vtr: null, frequency: 2 },
    benchmark_ref:
      'Global 2024-25 (FanIQ, AdBacklog). CPV is "under USD 0.10" converted. Reddit is the least-evidenced row.',
  },
  search: {
    values: { ctr: SEARCH_FALLBACK.ctr, conversion_rate: SEARCH_FALLBACK.conversion_rate, cpv: null, vtr: null, frequency: null },
    benchmark_ref:
      "WordStream / LocaliQ 2026, global, published 1 Jun 2026. No AU-only CTR/CVR source exists; the AU articles all cite the same study.",
  },
  "prog-video-cf": {
    values: { ctr: 0.008, conversion_rate: null, cpv: 0.1, vtr: 0.75, frequency: 3 },
    benchmark_ref:
      "CTR is YouTube TrueView global (0.5-1.5%). CPV and VTR are agency: public YouTube skippable benchmarks are 15-30% view rate and USD 0.10-0.30 CPV, but Channel Factory delivers 70%+ view rate at about $0.06 on BIC today, so the public figures would be wrong for how we buy it. Keep the 75% / $0.09 already on BICAU002 as the house number.",
  },
  "prog-video-instream": {
    values: { ctr: 0.005, conversion_rate: null, cpv: 0.2, vtr: 0.7, frequency: 3 },
    benchmark_ref:
      "Agency. Premium in-stream completion sits between YouTube skippable (15-30%) and CTV (94-98%); 70% is the usual planning figure. CPV is USD 0.10-0.30 converted, mid-point.",
  },
  bvod: {
    values: { ctr: 0.0005, conversion_rate: null, cpv: null, vtr: 0.95, frequency: 3 },
    benchmark_ref:
      "Completion: CTV 94-98%, median 96% (Innovid 2024 / Adwave Q3 2025). CTR is agency: BICAU002's live CTR is 0.02% against a saved 0.40% target, which is a display number, not a BVOD one. Frequency 3-5 per household per campaign (Adwave 2026).",
  },
  display: {
    values: { ctr: 0.0035, conversion_rate: 0.007, cpv: null, vtr: null, frequency: 3 },
    benchmark_ref:
      "Global 2026 (DigitalApplied composite of GDN, TTD, IAS/DV). PMP 0.58%, retargeting CVR 1.42% if you want a second row.",
  },
  "display-taboola": {
    values: { ctr: 0.003, conversion_rate: 0.007, cpv: null, vtr: null, frequency: 3 },
    benchmark_ref:
      "Native benchmark is 1.16% but that is premium native; Taboola feed placements run 0.2-0.4%. Agency on the CTR.",
  },
  audio: {
    values: { ctr: null, conversion_rate: null, cpv: null, vtr: null, frequency: 3 },
    benchmark_ref:
      "Listen-through rate is the KPI (90%+) and the review card has no field for it. Frequency only.",
  },
}

const SKIPPED_CHANNELS = new Set([
  "ooh",
  "prog_ooh",
  "television",
  "radio",
  "newspaper",
  "magazines",
  "cinema",
  "production",
  "influencers",
  "integrations",
  "press",
])

export function parseArgs(argv) {
  const clients = []
  let all = false
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === "--all") {
      all = true
      continue
    }
    if (token === "--apply") {
      apply = true
      continue
    }
    if (token === "--client") {
      const name = argv[i + 1]
      if (!name || name.startsWith("--")) {
        throw new Error('--client requires a name, e.g. --client "BIC"')
      }
      clients.push(name)
      i += 1
    }
  }
  return { clients, all, apply }
}

function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function haystack(publisher, platform) {
  return `${norm(publisher)} ${norm(platform)}`
}

function isSetMetric(value) {
  if (value == null || value === "") return false
  const n = Number(value)
  return Number.isFinite(n) && n !== 0
}

export function isEmptyKpiRow(row) {
  if (!row) return true
  return METRIC_KEYS.every((key) => !isSetMetric(row[key]))
}

export function resolveSearchIndustry(clientName) {
  const client = norm(clientName)
  for (const row of SEARCH_INDUSTRY) {
    if (row.names.some((name) => client === name || client.includes(name))) {
      return { ctr: row.ctr, conversion_rate: row.conversion_rate }
    }
  }
  return { ...SEARCH_FALLBACK }
}

export function resolveBenchmark(input) {
  const channel = String(input.channel ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
  if (!channel || SKIPPED_CHANNELS.has(channel)) return null

  const text = haystack(input.publisher, input.platform)

  if (channel === "social") {
    if (text.includes("tiktok")) return pack("social-tiktok")
    if (text.includes("reddit")) return pack("social-reddit")
    return pack("social-meta")
  }
  if (channel === "prog_video") {
    if (text.includes("channel factory")) return pack("prog-video-cf")
    return pack("prog-video-instream")
  }
  if (channel === "digi_video") return pack("prog-video-instream")
  if (channel === "search") {
    const industry = resolveSearchIndustry(input.clientName ?? "")
    const base = pack("search")
    return {
      ...base,
      values: {
        ...base.values,
        ctr: industry.ctr,
        conversion_rate: industry.conversion_rate,
      },
    }
  }
  if (channel === "digi_bvod" || channel === "prog_bvod" || channel === "bvod") {
    return pack("bvod")
  }
  if (channel === "prog_display" || channel === "digi_display") {
    if (text.includes("taboola") || text.includes("native")) return pack("display-taboola")
    return pack("display")
  }
  if (channel === "prog_audio" || channel === "digi_audio") return pack("audio")
  return null
}

function pack(key) {
  const row = BENCHMARKS[key]
  return {
    key,
    values: { ...row.values },
    benchmark_ref: row.benchmark_ref,
  }
}

export function decideLineAction(input) {
  const resolved = resolveBenchmark({
    channel: input.channel,
    publisher: input.publisher,
    platform: input.platform,
    clientName: input.clientName,
  })
  if (!resolved) {
    return { kind: "skip", reason: "skipped-channel" }
  }
  const values = {
    ...resolved.values,
    target_source: "benchmark",
    benchmark_ref: resolved.benchmark_ref,
  }
  if (input.existing && !isEmptyKpiRow(input.existing)) {
    return { kind: "skip", reason: "has-target" }
  }
  if (input.existing?.id != null) {
    return { kind: "update", id: input.existing.id, key: resolved.key, values }
  }
  return { kind: "insert", key: resolved.key, values }
}

function mediaTypeForChannel(channel) {
  const key = String(channel ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
  return CHANNEL_TO_MEDIA_TYPE[key] ?? key
}

function plannedFromLine(line) {
  const action = decideLineAction({
    channel: line.channel,
    publisher: line.publisher,
    platform: line.platform,
    clientName: line.mp_client_name,
    existing: line.kpi_id
      ? {
          id: line.kpi_id,
          ctr: line.ctr,
          conversion_rate: line.conversion_rate,
          cpv: line.cpv,
          vtr: line.vtr,
          frequency: line.frequency,
        }
      : null,
  })
  return {
    ...action,
    line,
    media_type: mediaTypeForChannel(line.channel),
  }
}

export async function runBackfill(options) {
  const { apply, all, clients, loadLines, applyClient } = options
  if (!all && (!clients || clients.length === 0)) {
    throw new Error("Pass --all or at least one --client \"<name>\"")
  }
  const lines = await loadLines({ all, clients })
  const planned = []
  for (const line of lines) {
    const row = plannedFromLine(line)
    if (row.kind === "skip") continue
    planned.push(row)
  }
  if (!apply) {
    return { planned, applied: false, written: [] }
  }
  const byClient = new Map()
  for (const row of planned) {
    const client = row.line.mp_client_name || "(unknown)"
    if (!byClient.has(client)) byClient.set(client, [])
    byClient.get(client).push(row)
  }
  const written = []
  for (const [client, rows] of byClient) {
    const out = await applyClient(client, rows)
    written.push(...out)
  }
  return { planned, applied: true, written }
}

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local")
  if (!fs.existsSync(envPath)) return
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = raw.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    let value = match[2]
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

function clientMatches(stored, filters) {
  if (!filters.length) return true
  const name = norm(stored)
  return filters.some((filter) => {
    const needle = norm(filter)
    return name === needle || name.includes(needle) || needle.includes(name)
  })
}

function fmt(value) {
  return value == null ? "—" : String(value)
}

function printReport(result) {
  const rows = result.planned.map((row) => ({
    client: row.line.mp_client_name,
    mba: row.line.mba_number,
    version: row.line.version_number,
    line_item_id: row.line.line_item_id,
    action: row.kind,
    key: row.key,
    ctr: fmt(row.values.ctr),
    conversion_rate: fmt(row.values.conversion_rate),
    cpv: fmt(row.values.cpv),
    vtr: fmt(row.values.vtr),
    frequency: fmt(row.values.frequency),
    id: row.writtenId ?? row.id ?? "",
    benchmark_ref: row.values.benchmark_ref,
  }))
  console.table(rows)
  const counts = new Map()
  for (const row of result.planned) {
    const client = row.line.mp_client_name || "(unknown)"
    counts.set(client, (counts.get(client) ?? 0) + 1)
  }
  console.log("Count per client")
  for (const [client, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${client}: ${count}`)
  }
  console.log(
    result.applied
      ? `Applied ${result.written.length} row(s).`
      : `Dry-run: ${result.planned.length} row(s) would be written. Pass --apply to persist.`,
  )
}

async function assertBenchmarkColumns(sql) {
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_kpi'
      AND column_name IN ('target_source', 'benchmark_ref')
  `
  if (cols.length < 2) {
    throw new Error(
      "campaign_kpi.target_source and benchmark_ref are missing. Apply db/migrations/0080_campaign_kpi_target_source.sql first.",
    )
  }
}

async function loadLinesFromDb(sql, { all, clients }) {
  const rows = await sql`
    SELECT
      m.mp_client_name,
      m.mba_number,
      m.campaign_name,
      m.campaign_status,
      v.version_number,
      li.line_item_id,
      li.channel::text AS channel,
      li.publisher,
      li.platform,
      li.bid_strategy,
      k.id AS kpi_id,
      k.ctr,
      k.cpv,
      k.conversion_rate,
      k.vtr,
      k.frequency
    FROM media_plan_masters m
    JOIN media_plan_versions v ON v.id = m.published_version_id
    JOIN line_items li ON li.version_id = v.id
    LEFT JOIN campaign_kpi k
      ON lower(k.mba_number) = lower(m.mba_number)
     AND k.version_number = v.version_number
     AND lower(k.line_item_id) = lower(li.line_item_id)
    WHERE lower(coalesce(m.campaign_status, '')) IN ('live', 'booked', 'approved')
      AND m.published_version_id IS NOT NULL
  `
  if (all) return rows
  return rows.filter((row) => clientMatches(row.mp_client_name, clients))
}

async function applyClientWrites(sql, _client, rows) {
  const written = []
  await sql.begin(async (tx) => {
    for (const row of rows) {
      const values = row.values
      if (row.kind === "update") {
        const [updated] = await tx`
          UPDATE campaign_kpi
          SET
            ctr = ${values.ctr},
            conversion_rate = ${values.conversion_rate},
            cpv = ${values.cpv},
            vtr = ${values.vtr},
            frequency = ${values.frequency},
            target_source = 'benchmark',
            benchmark_ref = ${values.benchmark_ref},
            media_type = ${row.media_type},
            publisher = ${row.line.publisher || row.line.platform || "unknown"},
            bid_strategy = ${row.line.bid_strategy || "fixed_cost"}
          WHERE id = ${row.id}
          RETURNING id
        `
        written.push({ ...row, writtenId: updated?.id ?? row.id })
        continue
      }
      const [inserted] = await tx`
        INSERT INTO campaign_kpi (
          mp_client_name,
          mba_number,
          version_number,
          campaign_name,
          media_type,
          publisher,
          bid_strategy,
          line_item_id,
          ctr,
          conversion_rate,
          cpv,
          vtr,
          frequency,
          target_source,
          benchmark_ref
        ) VALUES (
          ${row.line.mp_client_name},
          ${row.line.mba_number},
          ${row.line.version_number},
          ${row.line.campaign_name},
          ${row.media_type},
          ${row.line.publisher || row.line.platform || "unknown"},
          ${row.line.bid_strategy || "fixed_cost"},
          ${row.line.line_item_id},
          ${values.ctr},
          ${values.conversion_rate},
          ${values.cpv},
          ${values.vtr},
          ${values.frequency},
          'benchmark',
          ${values.benchmark_ref}
        )
        RETURNING id
      `
      written.push({ ...row, writtenId: inserted?.id ?? null })
    }
  })
  return written
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  if (!args.all && args.clients.length === 0) {
    throw new Error("Pass --all or at least one --client \"<name>\"")
  }
  loadEnvLocal()
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error("DATABASE_URL is required")
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    ssl: /localhost|127\.0\.0\.1/i.test(url) ? false : "require",
  })
  try {
    await assertBenchmarkColumns(sql)
    const result = await runBackfill({
      apply: args.apply,
      all: args.all,
      clients: args.clients,
      loadLines: (opts) => loadLinesFromDb(sql, opts),
      applyClient: (client, rows) => applyClientWrites(sql, client, rows),
    })
    if (result.applied) {
      const byKey = new Map(result.written.map((row) => [
        `${row.line.mba_number}|${row.line.version_number}|${String(row.line.line_item_id).toLowerCase()}`,
        row.writtenId,
      ]))
      for (const row of result.planned) {
        const key = `${row.line.mba_number}|${row.line.version_number}|${String(row.line.line_item_id).toLowerCase()}`
        if (byKey.has(key)) row.writtenId = byKey.get(key)
      }
    }
    printReport(result)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(path.resolve(entry)).href
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
