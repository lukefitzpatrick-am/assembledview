import assert from "node:assert/strict"
import test from "node:test"

import {
  REPORTS_WORKER_STUCK_MS,
  REPORTS_WORKER_TIMEOUT_ERROR,
  isReportRunClaimable,
  runReportsWorker,
  stuckGeneratingResolution,
  type ClaimedReportRun,
  type ReportWorkerGenerateInput,
} from "@/lib/reports/runReportsWorker"

const PERIOD = { periodStart: "2025-12-01", periodEnd: "2025-12-31" }

function claimed(id: string, attempts = 1): ClaimedReportRun {
  return { id, mbaNumber: `MBA-${id}`, attempts, ...PERIOD }
}

test("claim and complete with mocks", async () => {
  const generated: string[] = []
  const inputs: ReportWorkerGenerateInput[] = []
  let claims = 0
  const summary = await runReportsWorker({
    batch: 3,
    now: () => 1_000,
    resetStuck: async () => {},
    claimOne: async () => {
      claims += 1
      return claims === 1 ? claimed("a") : null
    },
    generate: async (input) => {
      inputs.push(input)
      return {
        fileName: "client-campaign-report-2025-12.pptx",
        blobPathname: "exports/reports/MBA-a/deck.pptx",
        commentaryGenerated: true,
      }
    },
    saveGenerated: async (id, fields) => {
      generated.push(`${id}:${fields.blobPathname}:${fields.fileName}:${fields.commentaryGenerated}`)
    },
    saveSkipped: async () => {
      throw new Error("skip was not expected")
    },
    saveFailed: async () => {
      throw new Error("fail was not expected")
    },
  })

  assert.equal(summary.claimed, 1)
  assert.equal(summary.generated, 1)
  assert.equal(summary.skipped, 0)
  assert.equal(summary.failed, 0)
  assert.equal(inputs[0]?.store, true)
  assert.equal(inputs[0]?.withCommentary, true)
  assert.deepEqual(inputs[0]?.period, {
    kind: "custom",
    start: "2025-12-01",
    end: "2025-12-31",
  })
  assert.equal(
    generated[0],
    "a:exports/reports/MBA-a/deck.pptx:client-campaign-report-2025-12.pptx:true",
  )
})

test("budget stop refuses another claim once 60s or less remains", async () => {
  let nowMs = 0
  let claims = 0
  const summary = await runReportsWorker({
    batch: 3,
    now: () => nowMs,
    resetStuck: async () => {},
    claimOne: async () => {
      claims += 1
      return claimed(String(claims))
    },
    generate: async () => {
      nowMs += 200_000
      return {
        fileName: "deck.pptx",
        blobPathname: "exports/reports/deck.pptx",
        commentaryGenerated: false,
      }
    },
    saveGenerated: async () => {},
    saveSkipped: async () => {},
    saveFailed: async () => {},
  })

  assert.equal(claims, 1)
  assert.equal(summary.claimed, 1)
  assert.equal(summary.generated, 1)
  assert.equal(summary.durationMs, 200_000)
})

test("stuck-row reset runs before any claim", async () => {
  const order: string[] = []
  await runReportsWorker({
    batch: 3,
    now: () => 5_000,
    resetStuck: async () => {
      order.push("reset")
    },
    claimOne: async () => {
      order.push("claim")
      return null
    },
    generate: async () => {
      throw new Error("no row")
    },
    saveGenerated: async () => {},
    saveSkipped: async () => {},
    saveFailed: async () => {},
  })

  assert.deepEqual(order, ["reset", "claim"])
  assert.deepEqual(stuckGeneratingResolution(1), { status: "queued", error: null })
  assert.deepEqual(stuckGeneratingResolution(2), { status: "queued", error: null })
  assert.equal(REPORTS_WORKER_STUCK_MS, 30 * 60 * 1000)
})

test("a failed or stuck row stops at 3 attempts", async () => {
  type MemoryRow = {
    id: string
    status: string
    attempts: number
    startedAtMs: number | null
    error: string | null
    mbaNumber: string
  }

  const rows: MemoryRow[] = [
    {
      id: "failed-row",
      status: "failed",
      attempts: 2,
      startedAtMs: null,
      error: "boom",
      mbaNumber: "MBA-FAIL",
    },
    {
      id: "stuck-row",
      status: "generating",
      attempts: 3,
      startedAtMs: 0,
      error: null,
      mbaNumber: "MBA-STUCK",
    },
  ]
  const saved: string[] = []
  let nowMs = REPORTS_WORKER_STUCK_MS + 1

  function applyReset() {
    for (const row of rows) {
      if (row.status !== "generating" || row.startedAtMs == null) continue
      if (nowMs - row.startedAtMs <= REPORTS_WORKER_STUCK_MS) continue
      const next = stuckGeneratingResolution(row.attempts)
      row.status = next.status
      row.error = next.error
    }
  }

  function claim(): ClaimedReportRun | null {
    const row = rows.find((item) => isReportRunClaimable(item.status, item.attempts))
    if (!row) return null
    row.attempts += 1
    row.status = "generating"
    row.startedAtMs = nowMs
    return {
      id: row.id,
      mbaNumber: row.mbaNumber,
      attempts: row.attempts,
      ...PERIOD,
    }
  }

  const first = await runReportsWorker({
    batch: 3,
    now: () => nowMs,
    resetStuck: async () => {
      applyReset()
    },
    claimOne: async () => claim(),
    generate: async () => {
      throw new Error("x".repeat(600))
    },
    saveGenerated: async () => {},
    saveSkipped: async () => {},
    saveFailed: async (id, error) => {
      const row = rows.find((item) => item.id === id)
      if (!row) return
      row.status = "failed"
      row.error = error
      saved.push(`${id}:${error.length}`)
    },
  })

  assert.equal(first.claimed, 1)
  assert.equal(first.failed, 1)
  assert.equal(saved[0], "failed-row:500")
  assert.equal(rows.find((row) => row.id === "failed-row")?.attempts, 3)
  assert.equal(rows.find((row) => row.id === "stuck-row")?.status, "failed")
  assert.equal(rows.find((row) => row.id === "stuck-row")?.error, REPORTS_WORKER_TIMEOUT_ERROR)
  assert.equal(isReportRunClaimable("failed", 3), false)

  const second = await runReportsWorker({
    batch: 3,
    now: () => nowMs,
    resetStuck: async () => {
      applyReset()
    },
    claimOne: async () => claim(),
    generate: async () => {
      throw new Error("should not generate")
    },
    saveGenerated: async () => {},
    saveSkipped: async () => {},
    saveFailed: async () => {
      throw new Error("should not fail again")
    },
  })

  assert.equal(second.claimed, 0)
  assert.equal(second.failed, 0)
})
