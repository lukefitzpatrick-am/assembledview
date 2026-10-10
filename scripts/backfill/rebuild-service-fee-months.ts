/**
 * Insert missing __service__fees schedule_months rows on the published tip.
 *
 * A month gains a row when explodeScheduleToMonthRows now emits
 * __service__fees (header feeTotal > 0 and no per-line fee) and that
 * version/basis/month has no fee row yet. The fee stays on __service__fees.
 * approved_slice and snapshot_checksum are not touched.
 *
 * Default is --dry-run. --apply inserts, one transaction per version.
 * Luke runs --apply by hand after review.
 *
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/backfill/rebuild-service-fee-months.ts
 *   node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/backfill/rebuild-service-fee-months.ts --apply
 */
import { eq, isNotNull, sql } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { fromCents, sumCents } from "@/lib/money"
import { rowsOf } from "@/lib/xero/dbRows"
import { explodeScheduleToMonthRows } from "@/scripts/migration/_scheduleTransform"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

const WINDOW_MONTHS = new Set([
  "2026-07-01",
  "2026-08-01",
  "2026-09-01",
  "2026-10-01",
])
const INCLUDED_STATUS = new Set(["approved", "booked", "completed"])

type Basis = "billing" | "delivery"

type Gain = {
  versionId: number
  versionNumber: number
  mbaNumber: string
  campaignStatus: string
  basis: Basis
  month: string
  amountCents: number
}

type FeePresence = {
  hasService: boolean
  hasLineFee: boolean
}

function argHas(flag: string): boolean {
  return process.argv.includes(flag)
}

function monthText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, "0")
    const d = String(value.getUTCDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return String(value ?? "").slice(0, 10)
}

function feeKey(versionId: number, basis: string, month: string): string {
  return `${versionId}|${basis}|${month}`
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true"
}

function schedulesOf(raw: unknown): { billing: unknown; delivery: unknown } {
  if (raw == null || typeof raw !== "object") {
    return { billing: null, delivery: null }
  }
  const blob = raw as { billingSchedule?: unknown; deliverySchedule?: unknown }
  return {
    billing: blob.billingSchedule ?? null,
    delivery: blob.deliverySchedule ?? null,
  }
}

function aud(cents: number): string {
  return fromCents(cents).toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
  })
}

function pad(value: unknown, width: number): string {
  return String(value ?? "").padEnd(width)
}

async function loadFeePresence(
  versionIds: number[],
): Promise<Map<string, FeePresence>> {
  const presence = new Map<string, FeePresence>()
  if (versionIds.length === 0) return presence

  const db = getDb()
  const rows = rowsOf<{
    version_id: number | string
    basis: string
    month: string
    has_service: unknown
    has_line_fee: unknown
  }>(
    await db.execute(sql`
      SELECT
        version_id,
        basis,
        month::text AS month,
        bool_or(line_item_id = '__service__fees') AS has_service,
        bool_or(line_item_id <> '__service__fees' AND amount_cents <> 0) AS has_line_fee
      FROM schedule_months
      WHERE component = 'fee'
        AND version_id IN (${sql.join(
          versionIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      GROUP BY version_id, basis, month
    `),
  )

  for (const row of rows) {
    presence.set(feeKey(Number(row.version_id), row.basis, monthText(row.month)), {
      hasService: asBool(row.has_service),
      hasLineFee: asBool(row.has_line_fee),
    })
  }
  return presence
}

async function findGains(): Promise<{ gains: Gain[]; failures: string[]; scanned: number }> {
  const db = getDb()
  const versions = await db
    .select({
      versionId: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      campaignStatus: schema.mediaPlanMasters.campaignStatus,
      legacySchedules: schema.mediaPlanVersions.legacySchedules,
    })
    .from(schema.mediaPlanVersions)
    .innerJoin(
      schema.mediaPlanMasters,
      eq(schema.mediaPlanMasters.publishedVersionId, schema.mediaPlanVersions.id),
    )
    .where(isNotNull(schema.mediaPlanVersions.publishedAt))

  const presence = await loadFeePresence(versions.map((v) => v.versionId))
  const gains: Gain[] = []
  const failures: string[] = []

  for (const version of versions) {
    const status = String(version.campaignStatus ?? "").trim().toLowerCase()
    const schedules = schedulesOf(version.legacySchedules)
    const bases: Array<{ basis: Basis; raw: unknown }> = [
      { basis: "billing", raw: schedules.billing },
      { basis: "delivery", raw: schedules.delivery },
    ]

    for (const { basis, raw } of bases) {
      const exploded = explodeScheduleToMonthRows(version.versionId, basis, raw)
      if (exploded.failureReason) {
        failures.push(
          `${version.mbaNumber} v${version.versionNumber} (${version.versionId}) ${basis}: ${exploded.failureReason}`,
        )
        continue
      }
      for (const row of exploded.rows) {
        if (row.lineItemId !== "__service__fees" || row.component !== "fee") continue
        const key = feeKey(version.versionId, basis, row.month)
        const existing = presence.get(key)
        if (existing?.hasService || existing?.hasLineFee) continue
        gains.push({
          versionId: version.versionId,
          versionNumber: version.versionNumber,
          mbaNumber: version.mbaNumber,
          campaignStatus: status,
          basis,
          month: row.month,
          amountCents: row.amountCents,
        })
      }
    }
  }

  gains.sort(
    (a, b) =>
      a.mbaNumber.localeCompare(b.mbaNumber) ||
      a.month.localeCompare(b.month) ||
      a.basis.localeCompare(b.basis) ||
      a.versionId - b.versionId,
  )
  return { gains, failures, scanned: versions.length }
}

function printReport(gains: Gain[], failures: string[], scanned: number): void {
  console.log("mba               ver  version_id  basis     month       cents   status")
  console.log("----------------  ---  ----------  --------  ----------  ------  ----------")
  for (const row of gains) {
    console.log(
      `${pad(row.mbaNumber, 16)}  ${pad(row.versionNumber, 3)}  ${pad(row.versionId, 10)}  ${pad(row.basis, 8)}  ${pad(row.month, 10)}  ${pad(row.amountCents, 6)}  ${row.campaignStatus}`,
    )
  }

  const cents = gains.map((row) => row.amountCents)
  const total = sumCents(cents)
  const billing = gains.filter((row) => row.basis === "billing")
  const delivery = gains.filter((row) => row.basis === "delivery")
  const window = billing.filter(
    (row) =>
      INCLUDED_STATUS.has(row.campaignStatus) && WINDOW_MONTHS.has(row.month),
  )

  console.log("")
  console.log(`published tips scanned: ${scanned}`)
  console.log(`explode failures: ${failures.length}`)
  for (const failure of failures) console.log(`  ${failure}`)
  console.log(`rows that would be inserted: ${gains.length}`)
  console.log(`total cents: ${total} (${aud(total)})`)
  console.log(
    `billing: ${billing.length} rows, ${sumCents(billing.map((row) => row.amountCents))} cents (${aud(sumCents(billing.map((row) => row.amountCents)))})`,
  )
  console.log(
    `delivery: ${delivery.length} rows, ${sumCents(delivery.map((row) => row.amountCents))} cents (${aud(sumCents(delivery.map((row) => row.amountCents)))})`,
  )
  console.log(
    `billing + approved|booked|completed + 2026-07..2026-10: ${window.length} rows, ${sumCents(window.map((row) => row.amountCents))} cents (${aud(sumCents(window.map((row) => row.amountCents)))})`,
  )
}

async function applyGains(gains: Gain[]): Promise<number> {
  const db = getDb()
  const byVersion = new Map<number, Gain[]>()
  for (const gain of gains) {
    const list = byVersion.get(gain.versionId) ?? []
    list.push(gain)
    byVersion.set(gain.versionId, list)
  }

  let inserted = 0
  for (const [versionId, rows] of byVersion) {
    const wrote = await db.transaction(async (tx) => {
      const existing = rowsOf<{
        basis: string
        month: string
        has_service: unknown
        has_line_fee: unknown
      }>(
        await tx.execute(sql`
          SELECT
            basis,
            month::text AS month,
            bool_or(line_item_id = '__service__fees') AS has_service,
            bool_or(line_item_id <> '__service__fees' AND amount_cents <> 0) AS has_line_fee
          FROM schedule_months
          WHERE component = 'fee'
            AND version_id = ${versionId}
          GROUP BY basis, month
        `),
      )
      const blocked = new Set<string>()
      for (const row of existing) {
        if (asBool(row.has_service) || asBool(row.has_line_fee)) {
          blocked.add(`${row.basis}|${monthText(row.month)}`)
        }
      }
      const fresh = rows.filter((row) => !blocked.has(`${row.basis}|${row.month}`))
      if (fresh.length === 0) return 0
      await tx.insert(schema.scheduleMonths).values(
        fresh.map((row) => ({
          versionId: row.versionId,
          lineItemId: "__service__fees",
          component: "fee" as const,
          basis: row.basis,
          month: row.month,
          amountCents: row.amountCents,
          source: "computed" as const,
        })),
      )
      return fresh.length
    })
    inserted += wrote
    console.log(`applied version ${versionId}: ${wrote} row(s)`)
  }
  return inserted
}

async function main(): Promise<void> {
  const apply = argHas("--apply") && !argHas("--dry-run")
  const { gains, failures, scanned } = await findGains()
  printReport(gains, failures, scanned)

  if (!apply) {
    console.log("")
    console.log("dry-run (no writes). Pass --apply to insert.")
    return
  }

  const inserted = await applyGains(gains)
  console.log(`inserted ${inserted} row(s)`)
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
