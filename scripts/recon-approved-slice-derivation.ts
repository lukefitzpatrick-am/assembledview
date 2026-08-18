/**
 * HF6 recon: for every media_plan_versions row that has a frozen
 * approved_slice AND schedule_months rows, recompute the slice from
 * schedule_months and compare bucket totals.
 *
 * Compares totalCents, feeCents, adservingCents, and
 * (mediaCents + productionCents). Does not write approved_slice.
 *
 * Usage: npm run recon:approved-slice-derivation
 */

import { closeDb, getDb, schema } from "@/db"
import { deriveApprovedSliceFromScheduleRows } from "@/lib/docs/deriveApprovedSliceFromSchedule"
import type { ApprovedSlice } from "@/lib/finance/approvedSlice"
import { loadScheduleMonthRowsForVersions } from "@/lib/finance/scheduleMonthsSource"
import { loadEnvLocal } from "@/scripts/migration/_shared"

function isSlice(v: unknown): v is ApprovedSlice {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as ApprovedSlice).lines)
  )
}

function buckets(slice: ApprovedSlice): {
  totalCents: number
  feeCents: number
  adservingCents: number
  mediaPlusProductionCents: number
} {
  let feeCents = 0
  let adservingCents = 0
  let mediaPlusProductionCents = 0
  for (const line of slice.lines) {
    feeCents += Number(line.feeCents) || 0
    adservingCents += Number(line.adservingCents) || 0
    mediaPlusProductionCents +=
      (Number(line.mediaCents) || 0) + (Number(line.productionCents) || 0)
  }
  return {
    totalCents: Number(slice.totalCents) || 0,
    feeCents,
    adservingCents,
    mediaPlusProductionCents,
  }
}

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required")
    process.exit(1)
  }

  const db = getDb()
  const versions = await db
    .select({
      id: schema.mediaPlanVersions.id,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      approvedSlice: schema.mediaPlanVersions.approvedSlice,
    })
    .from(schema.mediaPlanVersions)

  const withSlice = versions.filter((v) => isSlice(v.approvedSlice))
  const ids = withSlice.map((v) => v.id)
  const rowsByVersion = await loadScheduleMonthRowsForVersions(ids)

  let skippedNoSchedule = 0
  let compared = 0
  let exact = 0
  const mismatches: Array<{
    mba: string
    version: number
    field: string
    persisted: number
    derived: number
  }> = []

  for (const v of withSlice) {
    const scheduleRows = rowsByVersion.get(v.id) ?? []
    if (scheduleRows.length === 0) {
      skippedNoSchedule += 1
      continue
    }

    const derived = deriveApprovedSliceFromScheduleRows(scheduleRows)
    if (!derived) {
      mismatches.push({
        mba: String(v.mbaNumber),
        version: Number(v.versionNumber),
        field: "derived_null",
        persisted: Number((v.approvedSlice as ApprovedSlice).totalCents) || 0,
        derived: 0,
      })
      compared += 1
      continue
    }

    const persisted = buckets(v.approvedSlice as ApprovedSlice)
    const got = buckets(derived)
    compared += 1

    const fields: Array<keyof typeof persisted> = [
      "totalCents",
      "feeCents",
      "adservingCents",
      "mediaPlusProductionCents",
    ]
    let rowExact = true
    for (const field of fields) {
      if (persisted[field] !== got[field]) {
        rowExact = false
        mismatches.push({
          mba: String(v.mbaNumber),
          version: Number(v.versionNumber),
          field,
          persisted: persisted[field],
          derived: got[field],
        })
      }
    }
    if (rowExact) exact += 1
  }

  console.log(`[recon-approved-slice-derivation] versions with approved_slice: ${withSlice.length}`)
  console.log(`[recon-approved-slice-derivation] skipped (no schedule_months): ${skippedNoSchedule}`)
  console.log(`[recon-approved-slice-derivation] compared: ${compared}`)
  console.log(
    `[recon-approved-slice-derivation] EXACT all four: ${exact}/${compared}`
  )
  if (mismatches.length > 0) {
    console.log(`[recon-approved-slice-derivation] mismatches: ${mismatches.length}`)
    for (const m of mismatches.slice(0, 50)) {
      console.log(
        `  ${m.mba} v${m.version} ${m.field}: persisted=${m.persisted} derived=${m.derived} delta=${m.derived - m.persisted}`
      )
    }
  }

  await closeDb()
  if (compared === 0) process.exit(1)
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
