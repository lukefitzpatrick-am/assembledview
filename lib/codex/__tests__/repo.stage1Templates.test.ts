/**
 * Codex Stage 1 step 5 — templates + idempotent recurring generation.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray, isNull } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  createGeneratedRecurringTask,
  createTask,
  TemplateLabelError,
  createTemplate,
  createTemplateItem,
  findGeneratedRecurringTask,
  listChecklistItems,
  listTemplateItems,
  updateTemplate,
} from "../repo.js"
import { resolveRecurringDue, parseRecurringRule } from "../recurringRule.js"
import { runCodexRecurring } from "../runRecurring.js"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

const MIXED = "Luke.Fitzpatrick@AssembledMedia.com.au"
const CLIENT_ID = 900_090_015
const RUN = `s1r${Date.now().toString(36)}`

const taskIds: number[] = []
const templateIds: number[] = []

async function backdate(taskId: number, createdAt: string): Promise<void> {
  await getDb()
    .update(schema.tasks)
    .set({ createdAt })
    .where(eq(schema.tasks.id, taskId))
}

async function instanceIdsForSeed(seedId: number): Promise<number[]> {
  const rows = await getDb()
    .select({ id: schema.tasks.id, description: schema.tasks.description })
    .from(schema.tasks)
    .where(
      and(eq(schema.tasks.source, "recurring"), isNull(schema.tasks.deletedAt))
    )
  const line = `[codex-seed:${seedId}]`
  return rows
    .filter((row) =>
      (row.description ?? "").split(/\r?\n/).some((part) => part.trim() === line)
    )
    .map((row) => Number(row.id))
}

async function wipe(): Promise<void> {
  if (!hasDb) return
  const database = getDb()
  if (taskIds.length) {
    await database
      .delete(schema.codexActivity)
      .where(
        and(
          eq(schema.codexActivity.entityType, "task"),
          inArray(schema.codexActivity.entityId, taskIds)
        )
      )
    await database
      .delete(schema.taskChecklistItems)
      .where(inArray(schema.taskChecklistItems.taskId, taskIds))
    await database.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds))
  }
  if (templateIds.length) {
    await database
      .delete(schema.codexActivity)
      .where(
        and(
          eq(schema.codexActivity.entityType, "task_template"),
          inArray(schema.codexActivity.entityId, templateIds)
        )
      )
    await database
      .delete(schema.taskTemplates)
      .where(inArray(schema.taskTemplates.id, templateIds))
  }
}

after(async () => {
  try {
    await wipe()
  } finally {
    await closeDb().catch(() => undefined)
  }
})

describe("templates + apply on create", { skip: !hasDb }, () => {
  it("create template items and apply to new task checklist", async () => {
    const tpl = await createTemplate(
      { name: `${RUN} EOM`, description: "End of month" },
      MIXED
    )
    assert.ok(tpl)
    templateIds.push(tpl.id)

    const a = await createTemplateItem(tpl.id, { label: "Pull pacing" }, MIXED)
    const b = await createTemplateItem(tpl.id, { label: "Send deck" }, MIXED)
    assert.ok(a && b)
    const items = await listTemplateItems(tpl.id)
    assert.equal(items.length, 2)
    assert.deepEqual(
      items.map((i) => i.label),
      ["Pull pacing", "Send deck"]
    )

    const task = await createTask(
      {
        title: `${RUN} apply`,
        clientId: CLIENT_ID,
        createdByEmail: MIXED,
        templateId: tpl.id,
      },
      MIXED
    )
    taskIds.push(Number(task.id))
    assert.equal(task.template_id, tpl.id)
    assert.equal(task.source, "template")

    const checklist = await listChecklistItems(Number(task.id))
    assert.deepEqual(
      checklist.map((c) => c.label),
      ["Pull pacing", "Send deck"]
    )
    assert.ok(checklist.every((c) => c.done === false))
  })
})

describe("template replace", { skip: !hasDb }, () => {
  it("replace keeps ids for unchanged labels", async () => {
    const tpl = await createTemplate(
      {
        name: `${RUN} replace`,
        items: [{ label: "Keep" }, { label: "Change" }, { label: "Drop" }],
      },
      MIXED
    )
    assert.ok(tpl?.items && tpl.items.length === 3)
    templateIds.push(tpl.id)
    const keep = tpl.items[0]!
    const change = tpl.items[1]!
    const drop = tpl.items[2]!

    const next = await updateTemplate(
      tpl.id,
      {
        name: `${RUN} replace`,
        items: [
          { id: change.id, label: "Change" },
          { id: keep.id, label: "Keep" },
          { label: "New" },
        ],
      },
      MIXED
    )
    assert.ok(next?.items)
    assert.equal(next.items.length, 3)
    assert.equal(next.items[0]?.id, change.id)
    assert.equal(next.items[0]?.label, "Change")
    assert.equal(next.items[1]?.id, keep.id)
    assert.equal(next.items[1]?.label, "Keep")
    assert.equal(next.items[2]?.label, "New")
    assert.ok(next.items.every((item) => item.id !== drop.id))
    assert.deepEqual(
      next.items.map((item) => item.sort),
      [0, 1, 2]
    )
  })

  it("a bad label writes nothing", async () => {
    const name = `${RUN} intact`
    const tpl = await createTemplate(
      { name, items: [{ label: "Stay" }, { label: "Put" }] },
      MIXED
    )
    assert.ok(tpl)
    templateIds.push(tpl.id)
    const before = await listTemplateItems(tpl.id)

    await assert.rejects(
      () =>
        updateTemplate(
          tpl.id,
          {
            name: `${name} renamed`,
            items: [
              { id: before[0]!.id, label: "Stay" },
              { label: "x".repeat(201) },
            ],
          },
          MIXED
        ),
      (error: unknown) => {
        assert.ok(error instanceof TemplateLabelError)
        return true
      }
    )

    const [row] = await getDb()
      .select({ name: schema.taskTemplates.name })
      .from(schema.taskTemplates)
      .where(eq(schema.taskTemplates.id, tpl.id))
    assert.equal(row?.name, name)
    const after = await listTemplateItems(tpl.id)
    assert.deepEqual(
      after.map((item) => ({
        id: item.id,
        label: item.label,
        sort: item.sort,
      })),
      before.map((item) => ({
        id: item.id,
        label: item.label,
        sort: item.sort,
      }))
    )

    const missing = `${RUN} never`
    await assert.rejects(
      () =>
        createTemplate({ name: missing, items: [{ label: "  " }] }, MIXED),
      (error: unknown) => {
        assert.ok(error instanceof TemplateLabelError)
        return true
      }
    )
    const created = await getDb()
      .select({ id: schema.taskTemplates.id })
      .from(schema.taskTemplates)
      .where(eq(schema.taskTemplates.name, missing))
    assert.equal(created.length, 0)
  })
})

describe("recurring generation idempotency", { skip: !hasDb }, () => {
  it("runCodexRecurring twice on LBD creates one task", async () => {
    const prevFlag = process.env.CODEX_V2
    process.env.CODEX_V2 = "on"

    try {
      const tpl = await createTemplate(
        { name: `${RUN} retainer`, description: null },
        MIXED
      )
      assert.ok(tpl)
      templateIds.push(tpl.id)
      await createTemplateItem(tpl.id, { label: "Close month" }, MIXED)

      // Seed series: template + client + monthly:lbd
      const seed = await createTask(
        {
          title: `${RUN} Acme EOM`,
          clientId: CLIENT_ID,
          createdByEmail: MIXED,
          templateId: tpl.id,
          recurringRule: "monthly:lbd",
        },
        MIXED
      )
      const seedId = Number(seed.id)
      taskIds.push(seedId)
      await backdate(seedId, "2026-05-01T00:00:00.000Z")
      assert.equal(seed.recurring_rule, "monthly:lbd")

      // Pin to a known Sydney LBD: Fri 29 May 2026
      const now = new Date("2026-05-29T00:00:00.000Z")
      const parsed = parseRecurringRule("monthly:lbd")
      assert.ok(parsed)
      const due = resolveRecurringDue(parsed, now)
      assert.equal(due.shouldGenerate, true)
      assert.equal(due.period, "2026-05-lbd")

      const first = await runCodexRecurring(now)
      assert.equal(first.status, "ok")
      const firstIds = await instanceIdsForSeed(seedId)
      assert.equal(firstIds.length, 1)
      taskIds.push(firstIds[0]!)

      const found = await findGeneratedRecurringTask(seedId, due.period)
      assert.ok(found)
      assert.equal(found.source, "recurring")
      assert.equal(found.recurring_rule, null)
      assert.ok(found.description?.startsWith("[codex-period:2026-05-lbd]"))

      const checklist = await listChecklistItems(Number(found.id))
      assert.equal(checklist.length, 1)
      assert.equal(checklist[0]?.label, "Close month")

      const second = await runCodexRecurring(now)
      assert.equal(second.status, "ok")
      const secondIds = await instanceIdsForSeed(seedId)
      assert.equal(secondIds.length, 1)
      assert.equal(secondIds[0], firstIds[0])

      const again = await findGeneratedRecurringTask(seedId, due.period)
      assert.ok(again)
      assert.equal(Number(again.id), Number(found.id))
    } finally {
      if (prevFlag === undefined) delete process.env.CODEX_V2
      else process.env.CODEX_V2 = prevFlag
    }
  })

  it("createGeneratedRecurringTask stamps period marker", async () => {
    const tpl = await createTemplate({ name: `${RUN} direct` }, MIXED)
    assert.ok(tpl)
    templateIds.push(tpl.id)

    const created = await createGeneratedRecurringTask({
      seedTaskId: 4242,
      title: `${RUN} period stamp`,
      clientId: CLIENT_ID,
      templateId: tpl.id,
      period: "2026-08-d15",
      dueYmd: "2026-08-15",
      createdByEmail: MIXED,
    })
    taskIds.push(Number(created.id))
    assert.ok(created.description?.startsWith("[codex-period:2026-08-d15]"))
    assert.match(created.description ?? "", /\[codex-seed:4242\]/)
  })

  it("a done seed generates nothing", async () => {
    const prevFlag = process.env.CODEX_V2
    process.env.CODEX_V2 = "on"
    try {
      const tpl = await createTemplate({ name: `${RUN} done-seed` }, MIXED)
      assert.ok(tpl)
      templateIds.push(tpl.id)
      const seed = await createTask(
        {
          title: `${RUN} done seed`,
          clientId: CLIENT_ID,
          createdByEmail: MIXED,
          templateId: tpl.id,
          recurringRule: "monthly:lbd",
          status: "done",
        },
        MIXED
      )
      const seedId = Number(seed.id)
      taskIds.push(seedId)
      await backdate(seedId, "2026-05-01T00:00:00.000Z")

      await runCodexRecurring(new Date("2026-05-29T00:00:00.000Z"))
      const ids = await instanceIdsForSeed(seedId)
      assert.deepEqual(ids, [])
    } finally {
      if (prevFlag === undefined) delete process.env.CODEX_V2
      else process.env.CODEX_V2 = prevFlag
    }
  })

  it("instance copies mba and estimate from the seed", async () => {
    const prevFlag = process.env.CODEX_V2
    process.env.CODEX_V2 = "on"
    try {
      const tpl = await createTemplate({ name: `${RUN} carry` }, MIXED)
      assert.ok(tpl)
      templateIds.push(tpl.id)
      const seed = await createTask(
        {
          title: `${RUN} carry fields`,
          clientId: CLIENT_ID,
          createdByEmail: MIXED,
          templateId: tpl.id,
          recurringRule: "monthly:lbd",
          mbaNumber: `${RUN}-MBA`,
          estimatedMinutes: 90,
          priority: "high",
          category: "reporting",
          assigneeEmail: MIXED,
        },
        MIXED
      )
      const seedId = Number(seed.id)
      taskIds.push(seedId)
      await backdate(seedId, "2026-05-01T00:00:00.000Z")

      await runCodexRecurring(new Date("2026-05-29T00:00:00.000Z"))
      const ids = await instanceIdsForSeed(seedId)
      assert.equal(ids.length, 1)
      taskIds.push(ids[0]!)
      const found = await findGeneratedRecurringTask(seedId, "2026-05-lbd")
      assert.ok(found)
      assert.equal(found.mba_number, `${RUN}-MBA`)
      assert.equal(found.estimated_minutes, 90)
      assert.equal(found.priority, "high")
      assert.equal(found.category, "reporting")
      assert.equal(found.assignee_email, MIXED.toLowerCase())
      assert.equal(found.client_id, CLIENT_ID)
    } finally {
      if (prevFlag === undefined) delete process.env.CODEX_V2
      else process.env.CODEX_V2 = prevFlag
    }
  })

  it("two seeds with the same template and client both generate", async () => {
    const prevFlag = process.env.CODEX_V2
    process.env.CODEX_V2 = "on"
    try {
      const tpl = await createTemplate({ name: `${RUN} twins` }, MIXED)
      assert.ok(tpl)
      templateIds.push(tpl.id)
      const mk = async (title: string) => {
        const seed = await createTask(
          {
            title,
            clientId: CLIENT_ID,
            createdByEmail: MIXED,
            templateId: tpl.id,
            recurringRule: "monthly:lbd",
          },
          MIXED
        )
        const id = Number(seed.id)
        taskIds.push(id)
        await backdate(id, "2026-05-01T00:00:00.000Z")
        return id
      }
      const a = await mk(`${RUN} twin A`)
      const b = await mk(`${RUN} twin B`)

      await runCodexRecurring(new Date("2026-05-29T00:00:00.000Z"))
      const aIds = await instanceIdsForSeed(a)
      const bIds = await instanceIdsForSeed(b)
      assert.equal(aIds.length, 1)
      assert.equal(bIds.length, 1)
      assert.notEqual(aIds[0], bIds[0])
      taskIds.push(aIds[0]!, bIds[0]!)
    } finally {
      if (prevFlag === undefined) delete process.env.CODEX_V2
      else process.env.CODEX_V2 = prevFlag
    }
  })

  it("catch-up creates the missed period once and a second run the same day creates none", async () => {
    const prevFlag = process.env.CODEX_V2
    process.env.CODEX_V2 = "on"
    try {
      const tpl = await createTemplate({ name: `${RUN} catchup` }, MIXED)
      assert.ok(tpl)
      templateIds.push(tpl.id)
      const seed = await createTask(
        {
          title: `${RUN} missed friday`,
          clientId: CLIENT_ID,
          createdByEmail: MIXED,
          templateId: tpl.id,
          recurringRule: "weekly:fri",
        },
        MIXED
      )
      const seedId = Number(seed.id)
      taskIds.push(seedId)
      // Thursday 6 Aug 2026 Sydney. Run on Saturday 8 Aug, after Friday 7 Aug.
      await backdate(seedId, "2026-08-06T02:00:00.000Z")
      const missed = resolveRecurringDue(
        { kind: "weekly", dow: "fri", weekday: 5 },
        new Date("2026-08-07T02:00:00.000Z")
      )
      assert.equal(missed.shouldGenerate, true)

      const saturday = new Date("2026-08-08T02:00:00.000Z")
      await runCodexRecurring(saturday)
      const firstIds = await instanceIdsForSeed(seedId)
      assert.equal(firstIds.length, 1)
      taskIds.push(firstIds[0]!)
      const found = await findGeneratedRecurringTask(seedId, missed.period)
      assert.ok(found)
      assert.equal(found.due_date, "2026-08-07")

      await runCodexRecurring(saturday)
      const secondIds = await instanceIdsForSeed(seedId)
      assert.deepEqual(secondIds, firstIds)
    } finally {
      if (prevFlag === undefined) delete process.env.CODEX_V2
      else process.env.CODEX_V2 = prevFlag
    }
  })
})
