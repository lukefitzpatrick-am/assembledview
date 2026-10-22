import assert from "node:assert/strict"
import test from "node:test"

import { computeSnapshotChecksum, type ChecksumScheduleRow } from "@/lib/docs/snapshotChecksum"
import { restoreServiceProductionRows } from "@/lib/docs/snapshotChecksumRestamp"

function row(lineItemId: string, basis: string, month: string, amountCents: number): ChecksumScheduleRow {
  return { lineItemId, component: "media", basis, month, amountCents, source: "computed" }
}

const AFTER_SB1: ChecksumScheduleRow[] = [
  row("STRMEA001PROD1", "billing", "2026-09-01", 11881),
  row("STRMEA001PROD2", "billing", "2026-09-01", 119),
  row("STRMEA001PROD1", "delivery", "2026-09-01", 11881),
  row("STRMEA001PROD1", "billing", "2026-10-01", 0),
  row("STRMEA001RA1", "billing", "2026-09-01", 258000),
  row("__service__production", "delivery", "2026-10-01", 500),
]

test("puts back one service production row per basis/month with bare production", () => {
  const restored = restoreServiceProductionRows(AFTER_SB1)
  const added = restored.slice(AFTER_SB1.length)
  assert.deepEqual(added, [
    row("__service__production", "billing", "2026-09-01", 12000),
    row("__service__production", "delivery", "2026-09-01", 11881),
  ])
})

test("the restored rows reproduce the pre-SB1 checksum", () => {
  const before = [
    ...AFTER_SB1,
    row("__service__production", "billing", "2026-09-01", 12000),
    row("__service__production", "delivery", "2026-09-01", 11881),
  ]
  const base = { approvedSlice: null, feeSnapshot: { fee: 1 } }
  const stored = computeSnapshotChecksum({ ...base, scheduleMonths: before })
  const current = computeSnapshotChecksum({ ...base, scheduleMonths: AFTER_SB1 })
  assert.notEqual(stored, current)
  assert.equal(
    computeSnapshotChecksum({ ...base, scheduleMonths: restoreServiceProductionRows(AFTER_SB1) }),
    stored,
  )
})

test("rows without bare production are unchanged", () => {
  const rows = [row("abc-production-v1-p1", "billing", "2026-09-01", 100)]
  assert.deepEqual(restoreServiceProductionRows(rows), rows)
})
