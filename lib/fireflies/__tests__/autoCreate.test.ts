import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  avaAutoKey,
  buildAutoTaskDescription,
  classifyActionItem,
  isOpenDuplicateForClient,
  planActionItems,
  type AutoCreateDeps,
} from "../autoCreate.js"
import type { RosterPerson } from "../actionItemBlocks.js"

const CHELSEA: RosterPerson = {
  email: "chelsea.schultz@assembledmedia.com.au",
  name: "Chelsea Schultz",
  aliases: ["chelsea@assembledmedia.com.au"],
}

const LUKE: RosterPerson = {
  email: "luke.fitzpatrick@assembledmedia.com.au",
  name: "Luke Fitzpatrick",
}

const BOSS_ACTIONS = `**Chelsea Schultz**
Deliver updated media plans to the client (07:55)
**Katherine Tunaley**
Share revised brand guidelines (09:12)
**Unassigned**
Book the next WIP (11:00)`

const AMBIGUOUS_ACTIONS = `**Alex Smith**
Send the deck (03:00)`

function planDeps(over: Partial<AutoCreateDeps> = {}): AutoCreateDeps {
  return {
    roster: [CHELSEA, LUKE],
    attendeeEmails: [
      "chelsea.schultz@assembledmedia.com.au",
      "katherine@bossengineering.com.au",
    ],
    clientId: 201,
    mbaNumber: "BOSS001",
    isInternal: false,
    meetingTitle: "Assembled X BOSS Engineering Weekly WIP",
    meetingUrl: "https://app.fireflies.ai/view/boss-wip",
    meetingDate: "2026-08-13T02:00:00.000Z",
    noteId: 42,
    existingAutoKeys: new Set(),
    openTasks: [],
    existingProposalKeys: new Set(),
    ruleAssigneeEmail: null,
    ...over,
  }
}

describe("classifyActionItem", () => {
  it("auto-creates only when client-attributed and the block uniquely resolves", () => {
    assert.equal(
      classifyActionItem({
        clientId: 201,
        isInternal: false,
        resolutionKind: "unique",
      }).action,
      "auto_create"
    )
  })

  it("does not auto-create without a client", () => {
    assert.equal(
      classifyActionItem({
        clientId: null,
        isInternal: false,
        resolutionKind: "unique",
      }).action,
      "proposal"
    )
  })

  it("skips unknown (non-roster) names", () => {
    assert.equal(
      classifyActionItem({
        clientId: 201,
        isInternal: false,
        resolutionKind: "unknown",
      }).action,
      "skip"
    )
  })

  it("routes Unassigned and ambiguous to proposals", () => {
    assert.equal(
      classifyActionItem({
        clientId: 201,
        isInternal: false,
        resolutionKind: "unassigned",
      }).action,
      "proposal"
    )
    assert.equal(
      classifyActionItem({
        clientId: 201,
        isInternal: false,
        resolutionKind: "ambiguous",
      }).action,
      "proposal"
    )
  })
})

describe("planActionItems — BOSS fixture", () => {
  it("creates a Chelsea task with ava actor fields and meeting+timestamp ref; skips Katherine; proposes Unassigned", () => {
    const plan = planActionItems(BOSS_ACTIONS, planDeps())
    assert.equal(plan.autoCreates.length, 1)
    const task = plan.autoCreates[0]!
    assert.match(task.title, /Deliver updated media plans/)
    assert.equal(task.assigneeEmail, CHELSEA.email)
    assert.equal(task.clientId, 201)
    assert.equal(task.mbaNumber, "BOSS001")
    assert.equal(task.source, "ava")
    assert.equal(task.actorKind, "ava")
    assert.equal(task.autoCreated, true)
    assert.match(task.description, /fireflies/)
    assert.match(task.description, /07:55/)
    assert.equal(plan.skipped.some((s) => /Katherine/i.test(s.blockName)), true)
    assert.equal(plan.proposals.length, 1)
    assert.match(plan.proposals[0]!.title, /Book the next WIP/)
    assert.equal(plan.proposals[0]!.assigneeEmail, null)
  })

  it("re-sync with the same auto key yields zero new tasks or proposals", () => {
    const first = planActionItems(BOSS_ACTIONS, planDeps())
    const keys = new Set(first.autoCreates.map((t) => t.avaAutoKey))
    const proposalKeys = new Set(
      first.proposals.map((p) => `${p.blockName}|${p.title}`.toLowerCase())
    )
    const second = planActionItems(
      BOSS_ACTIONS,
      planDeps({
        existingAutoKeys: keys,
        existingProposalKeys: proposalKeys,
      })
    )
    assert.equal(second.autoCreates.length, 0)
    assert.equal(second.proposals.length, 0)
  })

  it("skips auto-create when an open task already has the same title + client", () => {
    const plan = planActionItems(
      BOSS_ACTIONS,
      planDeps({
        openTasks: [
          {
            title: "Deliver updated media plans to the client (07:55)",
            clientId: 201,
          },
        ],
      })
    )
    assert.equal(plan.autoCreates.length, 0)
  })

  it("ambiguous name becomes a proposal with rule-suggested assignee when a rule exists", () => {
    const plan = planActionItems(
      AMBIGUOUS_ACTIONS,
      planDeps({
        roster: [
          { email: "alex.a@assembledmedia.com.au", name: "Alex Smith" },
          { email: "alex.b@assembledmedia.com.au", name: "Alex Smith" },
        ],
        ruleAssigneeEmail: "luke.fitzpatrick@assembledmedia.com.au",
      })
    )
    assert.equal(plan.autoCreates.length, 0)
    assert.equal(plan.proposals.length, 1)
    assert.equal(
      plan.proposals[0]!.assigneeEmail,
      "luke.fitzpatrick@assembledmedia.com.au"
    )
  })
})

describe("avaAutoKey / description / duplicate", () => {
  it("is stable for the same note + block + line", () => {
    const a = avaAutoKey(42, "Chelsea Schultz", "Deliver updated media plans (07:55)")
    const b = avaAutoKey(42, "chelsea schultz", "  Deliver updated media plans (07:55) ")
    assert.equal(a, b)
    assert.notEqual(a, avaAutoKey(43, "Chelsea Schultz", "Deliver updated media plans (07:55)"))
  })

  it("buildAutoTaskDescription includes meeting link and timestamp", () => {
    const d = buildAutoTaskDescription({
      meetingTitle: "BOSS WIP",
      meetingUrl: "https://app.fireflies.ai/view/x",
      meetingDate: "2026-08-13T02:00:00.000Z",
      timestamp: "07:55",
      sourceLine: "Deliver updated media plans (07:55)",
    })
    assert.match(d, /BOSS WIP/)
    assert.match(d, /fireflies/)
    assert.match(d, /07:55/)
  })

  it("isOpenDuplicateForClient matches normalised title + client among open tasks", () => {
    assert.equal(
      isOpenDuplicateForClient("Send Deck", 201, [
        { title: "send deck", clientId: 201 },
      ]),
      true
    )
    assert.equal(
      isOpenDuplicateForClient("Send Deck", 201, [
        { title: "Send Deck", clientId: 999 },
      ]),
      false
    )
  })
})
