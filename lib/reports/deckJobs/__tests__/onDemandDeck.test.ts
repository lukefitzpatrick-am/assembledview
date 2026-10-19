import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { drizzle } from "drizzle-orm/postgres-js"

import {
  ON_DEMAND_DECK_KIND,
  ON_DEMAND_GENERATING_TIMEOUT_MINUTES,
  ON_DEMAND_NOTE_PREFIX,
  ON_DEMAND_STALE_QUEUE_MINUTES,
  ON_DEMAND_TIMEOUT_ERROR,
  enqueueOnDemandDeck,
  executeOnDemandDeck,
  onDemandDeckMatchesLookup,
  isStaleQueued,
  isStuckGenerating,
  loadOnDemandDeckStatus,
  onDemandGenerateInput,
  onDemandInsert,
  runOnDemandDeckSafetyNet,
  type OnDemandDeckRow,
  type OnDemandEnqueueRepo,
} from "@/lib/reports/deckJobs/onDemandDeck"

const WINDOW = { periodStart: "2026-09-01", periodEnd: "2026-09-30" }

function row(partial: Partial<OnDemandDeckRow> & Pick<OnDemandDeckRow, "id" | "status">): OnDemandDeckRow {
  return {
    kind: ON_DEMAND_DECK_KIND,
    mbaNumber: "curatif004",
    periodStart: WINDOW.periodStart,
    periodEnd: WINDOW.periodEnd,
    attempts: 0,
    blobPathname: null,
    fileName: null,
    error: null,
    requestedByEmail: "planner@assembledmedia.com.au",
    detailLevel: "channel",
    createdAt: "2026-10-14T00:00:00.000Z",
    startedAt: null,
    ...partial,
  }
}

function memoryRepo(seed: OnDemandDeckRow[] = []): OnDemandEnqueueRepo & { rows: OnDemandDeckRow[] } {
  const rows = seed
  return {
    rows,
    async insertQueued(input) {
      const inflight = rows.find(
        (item) =>
          item.kind === ON_DEMAND_DECK_KIND &&
          item.mbaNumber === input.mbaNumber &&
          item.periodStart === input.periodStart &&
          item.detailLevel === input.detailLevel &&
          (item.status === "queued" || item.status === "generating"),
      )
      if (inflight) return null
      const created = row({
        id: `run-${rows.length + 1}`,
        status: "queued",
        mbaNumber: input.mbaNumber,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        requestedByEmail: input.requestedByEmail,
        detailLevel: input.detailLevel,
        createdAt: "2026-10-14T01:00:00.000Z",
      })
      rows.push(created)
      return { id: created.id }
    },
    async findInflight(mbaNumber, periodStart, detailLevel) {
      const found = rows.find(
        (item) =>
          item.kind === ON_DEMAND_DECK_KIND &&
          item.mbaNumber === mbaNumber &&
          item.periodStart === periodStart &&
          item.detailLevel === detailLevel &&
          (item.status === "queued" || item.status === "generating"),
      )
      return found ? { id: found.id, status: found.status } : null
    },
  }
}

const enqueueInput = {
  mbaNumber: "curatif004",
  periodStart: WINDOW.periodStart,
  periodEnd: WINDOW.periodEnd,
  requestedByEmail: "planner@assembledmedia.com.au",
  detailLevel: "channel" as const,
}

test("create returns queued without building a deck", async () => {
  const repo = memoryRepo()
  const result = await enqueueOnDemandDeck(repo, enqueueInput)
  assert.equal(result.status, "queued")
  assert.equal(result.runId, "run-1")
  assert.equal(repo.rows.length, 1)
  assert.equal(repo.rows[0]?.status, "queued")
  assert.equal(repo.rows[0]?.requestedByEmail, "planner@assembledmedia.com.au")
})

test("a second create while queued returns the same runId", async () => {
  const repo = memoryRepo()
  const first = await enqueueOnDemandDeck(repo, enqueueInput)
  const second = await enqueueOnDemandDeck(repo, enqueueInput)
  assert.equal(second.runId, first.runId)
  assert.equal(second.status, "queued")
  assert.equal(repo.rows.length, 1)
})

test("a second create while generating returns the same runId", async () => {
  const repo = memoryRepo()
  const first = await enqueueOnDemandDeck(repo, enqueueInput)
  repo.rows[0]!.status = "generating"
  const second = await enqueueOnDemandDeck(repo, enqueueInput)
  assert.equal(second.runId, first.runId)
  assert.equal(second.status, "generating")
  assert.equal(repo.rows.length, 1)
})

test("create after generated or failed makes a new row", async () => {
  for (const status of ["generated", "failed"] as const) {
    const repo = memoryRepo([
      row({ id: "done", status, fileName: "old.pptx", blobPathname: "exports/reports/curatif004/old.pptx" }),
    ])
    const created = await enqueueOnDemandDeck(repo, enqueueInput)
    assert.notEqual(created.runId, "done")
    assert.equal(created.status, "queued")
    assert.equal(repo.rows.length, 2)
  }
})

test("on-demand insert names the in-flight partial index", () => {
  const db = drizzle.mock()
  const text = onDemandInsert(db, {
    mbaNumber: "curatif004",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    requestedByEmail: "planner@assembledmedia.com.au",
    detailLevel: "channel",
  })
    .toSQL()
    .sql.replace(/\s+/g, " ")
    .toLowerCase()
  assert.ok(
    text.includes(
      "on conflict (\"kind\",\"mba_number\",\"period_start\",\"detail_level\") where kind = 'on_demand_deck' and status in ('queued', 'generating') do nothing",
    ),
    text,
  )
  assert.match(text, /'on_demand_deck'/)
  assert.match(text, /requested_by_email/)
})

test("build input matches today's export call on the stored window", () => {
  assert.deepEqual(
    onDemandGenerateInput({
      mbaNumber: "curatif004",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    }),
    {
      mbaNumber: "curatif004",
      period: { kind: "custom", start: "2026-09-01", end: "2026-09-30" },
      store: false,
      withCommentary: true,
      detailLevel: "channel",
    },
  )
})

test("a queued line_item row does not block a channel create", async () => {
  const repo = memoryRepo([row({ id: "lines", status: "queued", detailLevel: "line_item" })])
  const created = await enqueueOnDemandDeck(repo, enqueueInput)
  assert.notEqual(created.runId, "lines")
  assert.equal(created.status, "queued")
  assert.equal(repo.rows.length, 2)
})

test("findLatestOnDemandDeck does not return a line_item row for a channel request", () => {
  assert.equal(
    onDemandDeckMatchesLookup(
      {
        mbaNumber: "curatif004",
        periodStart: WINDOW.periodStart,
        periodEnd: WINDOW.periodEnd,
        detailLevel: "line_item",
      },
      {
        mbaNumber: "curatif004",
        periodStart: WINDOW.periodStart,
        periodEnd: WINDOW.periodEnd,
        detailLevel: "channel",
      },
    ),
    false,
  )
  const source = readFileSync(
    path.join(process.cwd(), "lib/reports/deckJobs/onDemandDeckStore.ts"),
    "utf8",
  )
  const lookup = source.slice(source.indexOf("export async function findLatestOnDemandDeck"))
  assert.match(lookup, /AND detail_level = \$\{detailLevel\}/)
})

test("job success sets generated with a pathname", async () => {
  const saved: Array<{ id: string; blobPathname: string; fileName: string; error: string | null }> = []
  await executeOnDemandDeck(
    row({ id: "run-1", status: "generating", attempts: 1, startedAt: "2026-10-14T01:00:00.000Z" }),
    {
      build: async () => ({ buffer: Buffer.from("ppt"), fileName: "curatif-report.pptx" }),
      store: async (mba, fileName, buffer) => {
        assert.equal(mba, "curatif004")
        assert.equal(fileName, "curatif-report.pptx")
        assert.equal(buffer.toString(), "ppt")
        return { pathname: "exports/reports/curatif004/curatif-report-abc.pptx", filename: fileName }
      },
      markGenerated: async (id, fields) => {
        saved.push({ id, ...fields })
      },
      markFailed: async () => {
        throw new Error("fail was not expected")
      },
    },
  )
  assert.equal(saved.length, 1)
  assert.equal(saved[0]?.id, "run-1")
  assert.equal(saved[0]?.blobPathname, "exports/reports/curatif004/curatif-report-abc.pptx")
  assert.equal(saved[0]?.fileName, "curatif-report.pptx")
  assert.equal(saved[0]?.error, null)
})

test("job error sets failed", async () => {
  const failed: Array<{ id: string; message: string }> = []
  await executeOnDemandDeck(row({ id: "run-1", status: "generating" }), {
    build: async () => {
      throw new Error("snowflake down")
    },
    store: async () => {
      throw new Error("store was not expected")
    },
    markGenerated: async () => {
      throw new Error("generated was not expected")
    },
    markFailed: async (id, message) => {
      failed.push({ id, message })
    },
  })
  assert.deepEqual(failed, [{ id: "run-1", message: "snowflake down" }])
})

test("a deck note is stored in error with a note: prefix", async () => {
  let storedError: string | null = "unset"
  await executeOnDemandDeck(row({ id: "run-1", status: "generating" }), {
    build: async () => ({ buffer: Buffer.from("ppt"), fileName: "deck.pptx", note: "No commentary." }),
    store: async () => ({ pathname: "exports/reports/curatif004/deck.pptx", filename: "deck.pptx" }),
    markGenerated: async (_id, fields) => {
      storedError = fields.error
    },
    markFailed: async () => {
      throw new Error("fail was not expected")
    },
  })
  assert.equal(storedError, `${ON_DEMAND_NOTE_PREFIX}No commentary.`)
})

test("status hides another MBA and splits a stored note", async () => {
  const generated = row({
    id: "run-1",
    status: "generated",
    fileName: "deck.pptx",
    blobPathname: "exports/reports/curatif004/deck.pptx",
    error: `${ON_DEMAND_NOTE_PREFIX}No commentary.`,
    createdAt: "2026-10-14T01:00:00.000Z",
  })
  const hidden = await loadOnDemandDeckStatus("run-1", {
    findRun: async () => generated,
    canSeeMba: async () => false,
  })
  assert.deepEqual(hidden, { error: "forbidden" })

  const visible = await loadOnDemandDeckStatus("run-1", {
    findRun: async () => generated,
    canSeeMba: async () => true,
  })
  assert.equal("error" in visible, false)
  if ("error" in visible) return
  assert.equal(
    visible.body.downloadUrl,
    "/api/reports/download?path=exports%2Freports%2Fcuratif004%2Fdeck.pptx",
  )
  assert.equal(visible.body.note, "No commentary.")
  assert.equal(visible.body.error, null)
  assert.equal(visible.body.fileName, "deck.pptx")
  assert.equal(visible.body.createdAt, "2026-10-14T01:00:00.000Z")

  const missing = await loadOnDemandDeckStatus("missing", {
    findRun: async () => null,
    canSeeMba: async () => true,
  })
  assert.deepEqual(missing, { error: "not_found" })
})

test("cron runs a stale queued row and fails a stuck generating row", async () => {
  const now = Date.parse("2026-10-14T02:00:00.000Z")
  const rows = [
    row({
      id: "stuck",
      status: "generating",
      attempts: 1,
      startedAt: new Date(now - (ON_DEMAND_GENERATING_TIMEOUT_MINUTES * 60_000 + 1_000)).toISOString(),
      createdAt: new Date(now - 20 * 60_000).toISOString(),
    }),
    row({
      id: "stale",
      status: "queued",
      createdAt: new Date(now - (ON_DEMAND_STALE_QUEUE_MINUTES * 60_000 + 1_000)).toISOString(),
    }),
    row({
      id: "fresh",
      status: "queued",
      createdAt: new Date(now - 30_000).toISOString(),
    }),
  ]
  const ran: string[] = []
  const summary = await runOnDemandDeckSafetyNet({
    failTimedOut: async () => {
      let count = 0
      for (const item of rows) {
        if (!isStuckGenerating(item, now)) continue
        item.status = "failed"
        item.error = ON_DEMAND_TIMEOUT_ERROR
        count += 1
      }
      return count
    },
    claimStale: async () => {
      const stale = rows
        .filter((item) => isStaleQueued(item, now))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (!stale) return null
      stale.status = "generating"
      stale.attempts += 1
      stale.startedAt = new Date(now).toISOString()
      return stale
    },
    run: async (claimed) => {
      ran.push(claimed.id)
    },
  })
  assert.equal(summary.timedOut, 1)
  assert.equal(summary.ran, true)
  assert.deepEqual(ran, ["stale"])
  assert.equal(rows.find((item) => item.id === "stuck")?.status, "failed")
  assert.equal(rows.find((item) => item.id === "stuck")?.error, "Timed out")
  assert.equal(rows.find((item) => item.id === "fresh")?.status, "queued")
  assert.equal(rows.find((item) => item.id === "stale")?.attempts, 1)
})

test("safety-net SQL uses the same stale and timeout thresholds", () => {
  const source = readFileSync(
    path.join(process.cwd(), "lib/reports/deckJobs/onDemandDeckStore.ts"),
    "utf8",
  )
  assert.match(source, /interval '2 minutes'/)
  assert.match(source, /interval '10 minutes'/)
  assert.match(source, /Timed out/)
  assert.match(source, /kind = 'on_demand_deck'/)
  assert.match(source, /attempts = attempts \+ 1/)
  assert.match(source, /started_at = now\(\)/)
  assert.match(source, /status = 'generating'/)
})

test("the route returns before the job and the cron is every five minutes", () => {
  const route = readFileSync(
    path.join(process.cwd(), "app/api/reports/on-demand/route.ts"),
    "utf8",
  )
  const cron = readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")
  const cronRoute = readFileSync(
    path.join(process.cwd(), "app/api/cron/on-demand-decks/route.ts"),
    "utf8",
  )
  assert.match(route, /after\(/)
  assert.match(route, /maxDuration = 300/)
  assert.match(route, /requireRole/)
  assert.match(route, /checkClientMbaAccess/)
  assert.ok(route.indexOf("after(") < route.lastIndexOf("return NextResponse.json"))
  assert.match(cron, /"path": "\/api\/cron\/on-demand-decks"/)
  assert.match(cron, /"schedule": "\*\/5 \* \* \* \*"/)
  assert.match(cronRoute, /assertCronSecret/)
  assert.match(cronRoute, /maxDuration = 300/)
})
