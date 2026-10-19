/**
 * One-off: run the creative preview cache job over the last 90 days of
 * delivery. Dry run by default (reads only; no Blob or Postgres writes).
 * `--confirm` fetches and writes in batches of 300 until nothing is left.
 *
 * With 0098 applied but not 0102, the dry run reads the warehouse only and
 * reports every candidate (no cache row has a source hash yet). `--confirm`
 * refuses until both markers exist.
 *
 * Usage:
 *   npm run creative-previews:backfill
 *   npm run creative-previews:backfill -- --days 60
 *   npm run creative-previews:backfill -- --confirm
 */

import {
  PREVIEW_BACKFILL_DAYS,
  PREVIEW_RUN_LIMIT,
  type PreviewJobResult,
} from "@/lib/creative/previews/core"
import { PREVIEW_0102_MISSING } from "@/lib/creative/previews/gate"
import { countPreviewCandidates, runCreativePreviewCache } from "@/lib/creative/previews/job"
import { readPreviewCacheGate } from "@/lib/creative/previews/markers"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function parseArgs(argv: string[]): { confirm: boolean; days: number } {
  const confirm = argv.includes("--confirm")
  const at = argv.indexOf("--days")
  const days = at >= 0 ? Number(argv[at + 1]) : PREVIEW_BACKFILL_DAYS
  if (!Number.isInteger(days) || days <= 0) throw new Error(`--days must be a positive integer`)
  return { confirm, days }
}

function printResult(label: string, result: PreviewJobResult): void {
  console.log(`\n${label} (last ${result.days} days, ${result.dryRun ? "dry run" : "confirmed"})`)
  console.table(
    Object.fromEntries(
      Object.entries({ ...result.byPlatform, total: result.totals }).map(([platform, counts]) => [
        platform,
        counts,
      ]),
    ),
  )
  for (const failure of result.failures.slice(0, 20)) {
    console.log(`  failed ${failure.platform}/${failure.creativeKey}: ${failure.reason}`)
  }
  if (result.failures.length > 20) console.log(`  … ${result.failures.length - 20} more failures`)
}

async function main(): Promise<void> {
  const { confirm, days } = parseArgs(process.argv.slice(2))
  const gate = await readPreviewCacheGate()

  if (!confirm) {
    if (gate.ready) {
      printResult(
        "Would fetch",
        await runCreativePreviewCache({ days, confirm: false, limit: Number.MAX_SAFE_INTEGER }),
      )
    } else if (gate.message === PREVIEW_0102_MISSING) {
      console.log("0102 not applied: warehouse-only count, every candidate counts as a fetch.")
      printResult("Would fetch", await countPreviewCandidates(days))
    } else {
      console.log(gate.message)
    }
    console.log(`\nDry run. Re-run with --confirm to write (batches of ${PREVIEW_RUN_LIMIT}).`)
    return
  }

  if (!gate.ready) {
    console.log(`${gate.message}. Nothing written.`)
    return
  }

  for (let batch = 1; ; batch++) {
    const result = await runCreativePreviewCache({ days, confirm: true })
    printResult(`Batch ${batch}`, result)
    if (result.status !== "ok" || result.totals.deferred === 0 || result.totals.fetched === 0) break
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
