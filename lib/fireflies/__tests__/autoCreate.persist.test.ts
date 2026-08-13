import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { persistActionItemPlan, type PersistActionItemDeps } from "../autoCreate.js"
import type { ActionItemPlan } from "../autoCreate.js"

function emptyPlan(over: Partial<ActionItemPlan> = {}): ActionItemPlan {
  return {
    autoCreates: [],
    proposals: [],
    skipped: [],
    ...over,
  }
}

describe("persistActionItemPlan", () => {
  it("creates the Chelsea task with source ava, actorKind ava, autoCreated, and meeting ref", async () => {
    const created: unknown[] = []
    const deps: PersistActionItemDeps = {
      createTask: async (input, actorEmail, actorKind) => {
        created.push({ input, actorEmail, actorKind })
        return { id: 77, title: input.title }
      },
      insertProposals: async () => {},
      recordDismissal: async () => {
        throw new Error("must not dismiss")
      },
    }
    const plan = emptyPlan({
      autoCreates: [
        {
          title: "Deliver updated media plans to the client (07:55)",
          description: "From meeting: BOSS WIP\nTimestamp: 07:55\nTranscript: https://app.fireflies.ai/view/x",
          assigneeEmail: "chelsea.schultz@assembledmedia.com.au",
          assigneeName: "Chelsea Schultz",
          clientId: 201,
          mbaNumber: "BOSS001",
          source: "ava",
          actorKind: "ava",
          autoCreated: true,
          sourceNoteId: 42,
          avaAutoKey: "key-chelsea-1",
          createdByEmail: "chelsea.schultz@assembledmedia.com.au",
          category: "meeting_followup",
        },
      ],
    })
    const result = await persistActionItemPlan(plan, deps)
    assert.equal(result.tasksCreated, 1)
    assert.equal(created.length, 1)
    const c = created[0] as {
      input: {
        source: string
        autoCreated: boolean
        sourceNoteId: number
        title: string
      }
      actorKind: string
    }
    assert.equal(c.input.source, "ava")
    assert.equal(c.actorKind, "ava")
    assert.equal(c.input.autoCreated, true)
    assert.match(c.input.title, /Deliver updated media plans/)
    assert.equal(c.input.sourceNoteId, 42)
  })

  it("does not create a task for skipped non-roster names", async () => {
    let taskCalls = 0
    await persistActionItemPlan(
      emptyPlan({
        skipped: [{ blockName: "Katherine Tunaley", line: "Share revised brand guidelines (09:12)" }],
      }),
      {
        createTask: async () => {
          taskCalls += 1
          return { id: 1, title: "x" }
        },
        insertProposals: async () => {},
        recordDismissal: async () => {},
      }
    )
    assert.equal(taskCalls, 0)
  })
})

describe("dismissAutoCreated recording", () => {
  it("records a dismissal training signal without creating a second task", async () => {
    const signals: unknown[] = []
    const { dismissAutoCreatedPure } = await import("../autoCreate.js")
    const result = await dismissAutoCreatedPure(
      {
        taskId: 77,
        decidedByEmail: "admin@assembledmedia.com.au",
      },
      {
        getTask: async () => ({
          id: 77,
          autoCreated: true,
          deletedAt: null,
          title: "Deliver updated media plans",
          clientId: 201,
          assigneeEmail: "chelsea.schultz@assembledmedia.com.au",
          sourceNoteId: 42,
        }),
        softDelete: async () => true,
        recordDismissal: async (row) => {
          signals.push(row)
        },
      }
    )
    assert.equal(result.ok, true)
    assert.equal(signals.length, 1)
    const row = signals[0] as { action: string; taskId: number }
    assert.equal(row.action, "auto_created_dismiss")
    assert.equal(row.taskId, 77)
  })
})
