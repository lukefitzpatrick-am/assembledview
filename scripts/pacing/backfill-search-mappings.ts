/**
 * One-off backfill: sync all search containers → pacing_mappings, refresh Snowflake dynamic tables,
 * then print verification counts and the “no recent delivery” list.
 *
 * **Equivalent API call:** `POST /api/pacing/mappings/sync-from-search-containers` with body `{}`
 * (no `clients_id` = sync all). This script invokes the same `syncSearchContainersToPacingMappings`
 * server helper with your local `.env.local` (Xano + Snowflake) — no browser session required.
 *
 * Usage:
 *   npx tsx scripts/pacing/backfill-search-mappings.ts
 *   npx tsx scripts/pacing/backfill-search-mappings.ts --dry-run
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import {
  SQL_COUNT_SEARCH_DELIVERY_7D,
  SQL_COUNT_SEARCH_SUFFIX_DIM,
  SQL_SEARCH_MAPPINGS_NO_RECENT_DELIVERY,
} from "@/lib/pacing/searchMappingsVerificationSql"

const REPO_ROOT = process.cwd()

function loadEnvLocal(): void {
  const p = path.join(REPO_ROOT, ".env.local")
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, "utf8")
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = val
    }
  }
}

function numCell(v: unknown): number {
  if (v === undefined || v === null) return 0
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

async function printVerification(): Promise<void> {
  const { querySnowflake } = await import("@/lib/snowflake/client")

  const dimRows =
    (await querySnowflake<Record<string, unknown>>(SQL_COUNT_SEARCH_SUFFIX_DIM, [], {
      label: "backfill_verify_dim",
    })) ?? []
  const dimCount = numCell(dimRows[0]?.C ?? dimRows[0]?.c)

  const factRows =
    (await querySnowflake<Record<string, unknown>>(SQL_COUNT_SEARCH_DELIVERY_7D, [], {
      label: "backfill_verify_fact",
    })) ?? []
  const factCount = numCell(factRows[0]?.C ?? factRows[0]?.c)

  const broken =
    (await querySnowflake<Record<string, unknown>>(SQL_SEARCH_MAPPINGS_NO_RECENT_DELIVERY, [], {
      label: "backfill_verify_broken",
    })) ?? []

  console.info("")
  console.info("[backfill] —— Verification ——")
  console.info(`[backfill] Active search + suffix_id rows in DIM_PLAN_MAPPING: ${dimCount}`)
  console.info(
    `[backfill] Distinct AV line items with search delivery in FACT_LINE_ITEM_PACING_DAILY (last 7d): ${factCount}`
  )
  console.info(
    `[backfill] Search suffix mappings with NO fact row in last 7 days (first ${broken.length}):`
  )
  if (broken.length === 0) {
    console.info("[backfill]   (none)")
  } else {
    for (const row of broken) {
      const id = row.AV_LINE_ITEM_ID ?? row.av_line_item_id
      const label = row.AV_LINE_ITEM_LABEL ?? row.av_line_item_label
      const code = row.AV_LINE_ITEM_CODE ?? row.av_line_item_code
      console.info(`[backfill]   ${String(id ?? "—")} | ${String(label ?? "—")} | code=${String(code ?? "—")}`)
    }
  }
  console.info("[backfill] —— End verification ——")
}

async function main(): Promise<void> {
  loadEnvLocal()
  const dryRun = process.argv.includes("--dry-run")

  console.info(
    "[backfill] Same logic as POST /api/pacing/mappings/sync-from-search-containers with empty JSON body."
  )
  if (dryRun) {
    console.info("[backfill] --dry-run: no Xano writes, no Snowflake MERGE/refresh.")
  }

  const { syncSearchContainersToPacingMappings } = await import("@/lib/pacing/syncSearchContainersToPacing")

  const result = await syncSearchContainersToPacingMappings({
    clientsId: null,
    mediaPlanVersionId: null,
    allowedClientIds: null,
    snowflake: !dryRun,
    dryRun,
    skipDynamicTableRefresh: !dryRun,
  })

  console.info("[backfill] Sync result:", JSON.stringify(result, null, 2))

  if (!dryRun) {
    const { refreshBothPacingMartDynamicTables } = await import("@/lib/snowflake/pacing-mapping-sync")
    console.info("[backfill] Refreshing FACT_DELIVERY_DAILY, then FACT_LINE_ITEM_PACING_DAILY …")
    await refreshBothPacingMartDynamicTables()
    console.info("[backfill] Dynamic table refresh submitted.")
    await printVerification()
  } else {
    console.info("[backfill] Skipping dynamic table refresh and verification (--dry-run).")
  }
}

main().catch((e) => {
  console.error("[backfill] Fatal:", e instanceof Error ? e.message : e)
  process.exitCode = 1
})
