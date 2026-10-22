/**
 * Re-stamp media_plan_versions.snapshot_checksum on the versions whose
 * schedule_months lost duplicated __service__production rows (SB1,
 * db/migrations/manual/2026-10-21_schedule_months_service_production_dupes_SUPABASE.sql).
 *
 * Measured 22 Oct 2026: 90 versions (13 masters). Not run. Luke decides.
 *
 * For each version with a stored checksum and a bare production line id
 * (^[A-Za-z]+[0-9]+PROD[0-9]+$) in schedule_months:
 *   current  = checksum of today's rows (what the tripwire and a fresh MBA PDF show)
 *   restored = checksum of today's rows plus the SB1 rows put back
 *              (__service__production, media, computed, per basis/month = the
 *              per-line production sum, where that month had none)
 * A version is re-stamped only when stored != current AND stored == restored,
 * so the only difference is the SB1 delete. Anything else is listed and left.
 *
 * Default is --dry-run (read-only, prints the list). --apply writes, in one
 * transaction, guarded on the stored value, and only when the count equals
 * --expect (default 90).
 *
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/backfill/restamp-snapshot-checksum.ts
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/backfill/restamp-snapshot-checksum.ts --apply --expect 90
 *
 * Keep the dry-run output: it is the only record of which old hash8 belongs
 * to which version once the stored value is replaced.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import {
  computeSnapshotChecksum,
  snapshotHash8,
  type ChecksumScheduleRow,
} from "@/lib/docs/snapshotChecksum"
import { restoreServiceProductionRows } from "@/lib/docs/snapshotChecksumRestamp"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import { rowsOf } from "@/lib/xero/dbRows"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function monthText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return String(value ?? "").slice(0, 10)
}

type Outcome = {
  versionId: number
  mbaNumber: string
  versionNumber: number
  stored: string
  current: string
  status: "restamp" | "already_matches" | "unexplained"
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const expect = Number(argValue("--expect") ?? "90")
  const db = getDb()

  const candidateRows = rowsOf<{ version_id: number | string }>(
    await db.execute(sql`
      SELECT DISTINCT s.version_id
      FROM schedule_months s
      JOIN media_plan_versions v ON v.id = s.version_id
      WHERE v.snapshot_checksum IS NOT NULL
        AND s.component = 'media'
        AND s.amount_cents <> 0
        AND s.line_item_id ~ '^[A-Za-z]+[0-9]+PROD[0-9]+$'
      ORDER BY s.version_id
    `),
  )
  const ids = candidateRows.map((r) => Number(r.version_id))
  if (ids.length === 0) {
    console.log("No candidate versions.")
    return
  }

  const versions = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      approvedSlice: schema.mediaPlanVersions.approvedSlice,
      snapshotChecksum: schema.mediaPlanVersions.snapshotChecksum,
    })
    .from(schema.mediaPlanVersions)
    .where(and(inArray(schema.mediaPlanVersions.id, ids), isNotNull(schema.mediaPlanVersions.snapshotChecksum)))
  const fees = await db
    .select({ versionId: schema.mbaFeeSnapshots.versionId, fees: schema.mbaFeeSnapshots.fees })
    .from(schema.mbaFeeSnapshots)
    .where(inArray(schema.mbaFeeSnapshots.versionId, ids))
  const feeByVersion = new Map(fees.map((f) => [f.versionId, f.fees]))
  const scheduleRows = await db
    .select({
      versionId: schema.scheduleMonths.versionId,
      lineItemId: schema.scheduleMonths.lineItemId,
      component: schema.scheduleMonths.component,
      basis: schema.scheduleMonths.basis,
      month: schema.scheduleMonths.month,
      amountCents: schema.scheduleMonths.amountCents,
      source: schema.scheduleMonths.source,
    })
    .from(schema.scheduleMonths)
    .where(inArray(schema.scheduleMonths.versionId, ids))
  const rowsByVersion = new Map<number, ChecksumScheduleRow[]>()
  for (const r of scheduleRows) {
    const list = rowsByVersion.get(r.versionId) ?? []
    list.push({
      lineItemId: String(r.lineItemId),
      component: String(r.component),
      basis: String(r.basis),
      month: monthText(r.month),
      amountCents: Number(r.amountCents) || 0,
      source: String(r.source ?? "computed"),
    })
    rowsByVersion.set(r.versionId, list)
  }

  const outcomes: Outcome[] = []
  for (const v of versions) {
    const stored = String(v.snapshotChecksum ?? "").trim()
    const rows = rowsByVersion.get(v.id) ?? []
    const base = {
      approvedSlice: v.approvedSlice as ApprovedSlice | null,
      feeSnapshot: feeByVersion.get(v.id) ?? null,
    }
    const current = computeSnapshotChecksum({ ...base, scheduleMonths: rows })
    const restored = computeSnapshotChecksum({
      ...base,
      scheduleMonths: restoreServiceProductionRows(rows),
    })
    const status: Outcome["status"] =
      stored === current ? "already_matches" : stored === restored ? "restamp" : "unexplained"
    outcomes.push({
      versionId: v.id,
      mbaNumber: v.mbaNumber,
      versionNumber: v.versionNumber,
      stored,
      current,
      status,
    })
  }

  outcomes.sort((a, b) => a.mbaNumber.localeCompare(b.mbaNumber) || a.versionNumber - b.versionNumber)
  const restamp = outcomes.filter((o) => o.status === "restamp")
  console.log("version_id,mba,version,status,stored_hash8,new_hash8")
  for (const o of outcomes) {
    console.log(
      `${o.versionId},${o.mbaNumber},${o.versionNumber},${o.status},${snapshotHash8(o.stored)},${o.status === "restamp" ? snapshotHash8(o.current) : ""}`,
    )
  }
  console.log(
    `candidates=${outcomes.length} restamp=${restamp.length} already_matches=${outcomes.filter((o) => o.status === "already_matches").length} unexplained=${outcomes.filter((o) => o.status === "unexplained").length}`,
  )

  if (!apply) {
    console.log("Dry run. Nothing written. Re-run with --apply --expect <n> to write.")
    return
  }
  if (restamp.length !== expect) {
    throw new Error(`Aborting: ${restamp.length} versions to re-stamp, expected ${expect}. Nothing written.`)
  }
  await db.transaction(async (tx) => {
    for (const o of restamp) {
      const updated = await tx
        .update(schema.mediaPlanVersions)
        .set({ snapshotChecksum: o.current })
        .where(
          and(
            eq(schema.mediaPlanVersions.id, o.versionId),
            eq(schema.mediaPlanVersions.snapshotChecksum, o.stored),
          ),
        )
        .returning({ id: schema.mediaPlanVersions.id })
      if (updated.length !== 1) {
        throw new Error(`Aborting: version ${o.versionId} changed since the check. Rolled back.`)
      }
    }
  })
  console.log(`Re-stamped ${restamp.length} versions.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => closeDb())
