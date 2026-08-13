import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  displayNameFromEmailLocal,
  parsePersonBlocks,
  resolveBlockAssignee,
  type RosterPerson,
} from "../actionItemBlocks.js"

const CHELSEA: RosterPerson = {
  email: "chelsea.schultz@assembledmedia.com.au",
  name: "Chelsea Schultz",
  aliases: ["chelsea@assembledmedia.com.au"],
}

const LUKE: RosterPerson = {
  email: "luke.fitzpatrick@assembledmedia.com.au",
  name: "Luke Fitzpatrick",
  aliases: ["luke@assembledmedia.com.au"],
}

const BOSS_ACTIONS = `**Chelsea Schultz**
Deliver updated media plans to the client (07:55)
**Katherine Tunaley**
Share revised brand guidelines (09:12)
**Unassigned**
Book the next WIP (11:00)`

describe("parsePersonBlocks — Fireflies bold-name headers", () => {
  it("splits BOSS-style **Name** blocks and keeps (mm:ss) refs on items", () => {
    const blocks = parsePersonBlocks(BOSS_ACTIONS)
    assert.equal(blocks.length, 3)
    assert.equal(blocks[0]!.name, "Chelsea Schultz")
    assert.equal(blocks[0]!.items.length, 1)
    assert.match(blocks[0]!.items[0]!.line, /Deliver updated media plans/)
    assert.equal(blocks[0]!.items[0]!.timestamp, "07:55")
    assert.equal(blocks[1]!.name, "Katherine Tunaley")
    assert.equal(blocks[2]!.name, "Unassigned")
  })
})

describe("displayNameFromEmailLocal", () => {
  it("maps chelsea.schultz@ to Chelsea Schultz", () => {
    assert.equal(
      displayNameFromEmailLocal("chelsea.schultz@assembledmedia.com.au"),
      "Chelsea Schultz"
    )
  })
})

describe("resolveBlockAssignee", () => {
  const roster = [CHELSEA, LUKE]
  const attendees = [
    "chelsea.schultz@assembledmedia.com.au",
    "katherine@bossengineering.com.au",
    "luke@assembledmedia.com.au",
  ]

  it("exact full-name match (case-insensitive) to an active roster member", () => {
    const r = resolveBlockAssignee("chelsea schultz", roster, attendees)
    assert.equal(r.kind, "unique")
    if (r.kind === "unique") {
      assert.equal(r.member.email, CHELSEA.email)
    }
  })

  it("matches a name derived from an attendee alias email", () => {
    const r = resolveBlockAssignee(
      "Chelsea Schultz",
      [
        {
          email: "chelsea.schultz@assembledmedia.com.au",
          name: "C Schultz",
          aliases: ["chelsea@assembledmedia.com.au"],
        },
      ],
      ["chelsea@assembledmedia.com.au"]
    )
    assert.equal(r.kind, "unique")
    if (r.kind === "unique") {
      assert.equal(r.member.email, "chelsea.schultz@assembledmedia.com.au")
    }
  })

  it("unknown for a client-side name not on the roster", () => {
    const r = resolveBlockAssignee("Katherine Tunaley", roster, attendees)
    assert.equal(r.kind, "unknown")
  })

  it("unassigned for Unassigned headers", () => {
    const r = resolveBlockAssignee("Unassigned", roster, attendees)
    assert.equal(r.kind, "unassigned")
  })

  it("ambiguous when two roster members share the same full name", () => {
    const r = resolveBlockAssignee(
      "Alex Smith",
      [
        { email: "alex.a@assembledmedia.com.au", name: "Alex Smith" },
        { email: "alex.b@assembledmedia.com.au", name: "Alex Smith" },
      ],
      []
    )
    assert.equal(r.kind, "ambiguous")
    if (r.kind === "ambiguous") {
      assert.equal(r.members.length, 2)
    }
  })
})
