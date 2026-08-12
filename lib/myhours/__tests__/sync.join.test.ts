import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ACTIVITY_CHUNK_DAYS,
  MyHoursAuthError,
  MyHoursClient,
  MYHOURS_AUTH_ERROR_MESSAGE,
  chunkDateRange,
} from "../client.js"
import {
  buildUserEmailById,
  joinActivityRows,
  mbaFromTaskName,
} from "../joinActivity.js"
import {
  campaignTaskName,
  mapJoinedEntry,
  resolvePullWindow,
  runMyHoursSync,
} from "../sync.js"

test("chunkDateRange covers inclusive window without gaps", () => {
  const chunks = chunkDateRange("2026-08-01", "2026-08-30", 14)
  assert.equal(chunks.length, 3)
  assert.deepEqual(chunks[0], { from: "2026-08-01", to: "2026-08-14" })
  assert.deepEqual(chunks[1], { from: "2026-08-15", to: "2026-08-28" })
  assert.deepEqual(chunks[2], { from: "2026-08-29", to: "2026-08-30" })
  assert.equal(ACTIVITY_CHUNK_DAYS, 14)
})

test("Users join: lowercases email; missing userId counted skip", () => {
  const usersById = buildUserEmailById([
    { id: 1, email: "LUKE@ASSEMBLEDMEDIA.COM.AU" },
    { id: 2, email: "  sam@assembledmedia.com.au " },
  ])
  assert.equal(usersById.get(1), "luke@assembledmedia.com.au")

  const joined = joinActivityRows(
    [
      {
        logId: 10,
        userId: 1,
        date: "2026-08-11T00:00:00",
        logDuration: 3600,
        projectId: 9,
        projectName: "Acme",
        taskId: 3,
        taskName: "foo001 — Campaign",
      },
      {
        logId: 11,
        userId: 999,
        date: "2026-08-11T00:00:00",
        logDuration: 1800,
      },
      {
        logId: 12,
        userId: 999,
        date: "2026-08-12T00:00:00",
        logDuration: 600,
      },
    ],
    usersById
  )

  assert.equal(joined.entries.length, 1)
  assert.equal(joined.entries[0]!.memberEmail, "luke@assembledmedia.com.au")
  assert.equal(joined.entries[0]!.durationMinutes, 60)
  assert.equal(joined.unknownUserCount, 1)
  assert.deepEqual(joined.unknownUserIds, [999])
})

test("mbaFromTaskName + campaignTaskName convention", () => {
  assert.equal(mbaFromTaskName("FOO001 — Brand push"), "foo001")
  assert.equal(campaignTaskName("FOO001", "Brand push"), "foo001 — Brand push")
})

test("401 fails loudly with API key invalid or rotated — no retry", async () => {
  let calls = 0
  const client = new MyHoursClient({
    getApiKey: () => "bad",
    maxRetries: 4,
    transport: async () => {
      calls += 1
      return new Response("nope", { status: 401 })
    },
  })
  await assert.rejects(
    () => client.listUsers(),
    (err: unknown) =>
      err instanceof MyHoursAuthError &&
      err.message === MYHOURS_AUTH_ERROR_MESSAGE
  )
  assert.equal(calls, 1)
})

test("manual mapping is never overwritten on re-map", () => {
  const mapped = mapJoinedEntry({
    entry: {
      myhoursLogId: "1",
      memberEmail: "a@x.com",
      entryDate: "2026-08-11",
      durationMinutes: 30,
      note: null,
      myhoursProjectId: "9",
      myhoursProjectName: "Acme",
      myhoursTaskId: "3",
      myhoursTaskName: "foo001 — X",
      raw: {
        logId: 1,
        userId: 1,
        date: "2026-08-11",
      },
    },
    existing: {
      myhoursLogId: "1",
      mappingSource: "manual",
      clientId: 42,
      mbaNumber: "kept001",
    },
    projectClientByMyhoursId: new Map([["9", 99]]),
    clientIdByProjectName: new Map(),
  })
  assert.equal(mapped.mappingSource, "manual")
  assert.equal(mapped.clientId, 42)
  assert.equal(mapped.mbaNumber, "kept001")
})

test("ensure-structure idempotent: second run creates zero projects/tasks", async () => {
  const created: string[] = []
  const links: Array<{
    kind: "client_project" | "campaign_task"
    clientId: number | null
    mbaNumber: string | null
    myhoursId: string
    myhoursName: string
  }> = []
  const entries: unknown[] = []

  const projects = [{ id: 100, name: "Acme" }]
  const tasks = [{ id: 200, name: "foo001 — Live" }]

  const depsBase = {
    getApiKey: () => "key",
    todayYmd: () => "2026-08-12",
    loadCursorDateFrom: async () => "2026-08-12",
    listClientAnchors: async () => [
      { clientId: 1, projectName: "Acme" },
    ],
    listActiveCampaigns: async () => [
      {
        mbaNumber: "FOO001",
        campaignName: "Live",
        clientId: 1,
        campaignStatus: "booked",
      },
    ],
    listLinks: async () => links.map((l) => ({ ...l })),
    saveLink: async (link: (typeof links)[number]) => {
      links.push({ ...link })
      created.push(`${link.kind}:${link.myhoursId}`)
    },
    listExistingEntriesByLogIds: async () => [],
    upsertEntries: async (rows: unknown[]) => {
      entries.push(...rows)
      return rows.length
    },
    saveRun: async () => {},
    transport: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (url.includes("/Users/getAll")) {
        return Response.json([{ id: 1, email: "luke@x.com" }])
      }
      if (url.includes("/Projects/getAll")) {
        return Response.json(projects)
      }
      if (url.includes("/tasklist")) {
        return Response.json(tasks)
      }
      if (url.includes("/Reports/activity")) {
        return Response.json([])
      }
      if (method === "POST" && url.endsWith("/Projects")) {
        created.push("POST:/Projects")
        return Response.json({ id: 999, name: "Acme" }, { status: 201 })
      }
      if (method === "POST" && url.includes("/task")) {
        created.push("POST:/task")
        return Response.json({ id: 998, name: "foo001 — Live" }, { status: 201 })
      }
      return new Response("not found", { status: 404 })
    },
  }

  const first = await runMyHoursSync(depsBase)
  assert.equal(first.status, "ok")
  // First run matches existing project/task by name → still writes links
  assert.ok(links.length >= 2)

  const createdBeforeSecond = created.filter((c) => c.startsWith("POST:")).length
  const second = await runMyHoursSync(depsBase)
  assert.equal(second.status, "ok")
  assert.equal(second.structuresCreated, 0)
  const createdAfterSecond = created.filter((c) => c.startsWith("POST:")).length
  assert.equal(createdAfterSecond, createdBeforeSecond)
})

test("auth failure persists error message on sync run", async () => {
  let savedError: string | null = null
  const result = await runMyHoursSync({
    getApiKey: () => "bad",
    todayYmd: () => "2026-08-12",
    loadCursorDateFrom: async () => null,
    listClientAnchors: async () => [],
    listActiveCampaigns: async () => [],
    listLinks: async () => [],
    saveLink: async () => {},
    listExistingEntriesByLogIds: async () => [],
    upsertEntries: async () => 0,
    saveRun: async (row) => {
      savedError = row.error
    },
    transport: async () => new Response("nope", { status: 401 }),
  })
  assert.equal(result.status, "error")
  assert.equal(result.error, MYHOURS_AUTH_ERROR_MESSAGE)
  assert.equal(savedError, MYHOURS_AUTH_ERROR_MESSAGE)
})

test("resolvePullWindow overlaps 7 days for edits", () => {
  const w = resolvePullWindow({
    cursorFrom: "2026-08-12",
    todayYmd: "2026-08-12",
  })
  assert.equal(w.dateFrom, "2026-08-05")
  assert.equal(w.dateTo, "2026-08-12")
})
