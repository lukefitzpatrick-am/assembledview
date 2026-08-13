import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  parseEmailAliases,
  resolveRosterEmail,
  uniquePeopleFromEmails,
  type TeamMemberIdentity,
} from "../rosterAliases.js"

const LUKE: TeamMemberIdentity = {
  canonicalEmail: "luke.fitzpatrick@assembledmedia.com.au",
  name: "Luke Fitzpatrick",
  aliases: ["luke@assembledmedia.com.au"],
}

describe("parseEmailAliases", () => {
  it("lowercases and drops blanks", () => {
    assert.deepEqual(parseEmailAliases([" Luke@AssembledMedia.com.au ", ""]), [
      "luke@assembledmedia.com.au",
    ])
  })
})

describe("resolveRosterEmail", () => {
  it("resolves the short-form alias to the canonical person", () => {
    const hit = resolveRosterEmail("LUKE@assembledmedia.com.au", [LUKE])
    assert.equal(hit?.canonicalEmail, LUKE.canonicalEmail)
  })

  it("resolves the canonical address", () => {
    const hit = resolveRosterEmail(LUKE.canonicalEmail, [LUKE])
    assert.equal(hit?.canonicalEmail, LUKE.canonicalEmail)
  })
})

describe("uniquePeopleFromEmails", () => {
  it("dedupes luke@ and luke.fitzpatrick@ to one person", () => {
    const people = uniquePeopleFromEmails(
      [
        "luke@assembledmedia.com.au",
        "luke.fitzpatrick@assembledmedia.com.au",
        "client@acme.com",
      ],
      [LUKE]
    )
    assert.equal(people.length, 1)
    assert.equal(people[0]!.canonicalEmail, LUKE.canonicalEmail)
  })
})
