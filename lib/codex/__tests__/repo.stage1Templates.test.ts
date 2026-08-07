/**
 * Codex Stage 1 step 5 — templates + idempotent recurring generation.
 * Requires DATABASE_URL. Skips when unset.
 */
import assert from "node:assert/strict"
import { after, describe, it } from "node:test"
import { and, eq, inArray } from "drizzle-orm"

import { getDb, schema, closeDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import {
  createGeneratedRecurringTask,
  createTask,
  createTemplate,
  createTemplateItem,
  findGeneratedRecurringTask,
  listChecklistItems,
  listTemplateItems,
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
      taskIds.push(Number(seed.id))
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
      assert.ok(first.created >= 1)
      for (const id of first.createdIds) taskIds.push(id)

      const found = await findGeneratedRecurringTask(
        tpl.id,
        CLIENT_ID,
        due.period
      )
      assert.ok(found)
      assert.equal(found.source, "recurring")
      assert.equal(found.recurring_rule, null)

      const checklist = await listChecklistItems(Number(found.id))
      assert.equal(checklist.length, 1)
      assert.equal(checklist[0]?.label, "Close month")

      const second = await runCodexRecurring(now)
      assert.equal(second.status, "ok")
      assert.equal(second.created, 0)
      assert.ok(second.skippedExisting >= 1)

      // Direct create would also be blocked by find
      const again = await findGeneratedRecurringTask(
        tpl.id,
        CLIENT_ID,
        due.period
      )
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
      title: `${RUN} period stamp`,
      clientId: CLIENT_ID,
      templateId: tpl.id,
      period: "2026-08-d15",
      dueYmd: "2026-08-15",
      createdByEmail: MIXED,
    })
    taskIds.push(Number(created.id))
    assert.ok(created.description?.startsWith("[codex-period:2026-08-d15]"))
  })
})
