import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  parseEmailAliases,
  resolveRosterEmail,
  resolveRosterEmailResult,
  uniquePeopleFromEmails,
  type TeamMemberIdentity,
} from "../rosterAliases.js"

const LUKE: TeamMemberIdentity = {
  canonicalEmail: "luke.fitzpatrick@assembledmedia.com.au",
  name: "Luke Fitzpatrick",
  aliases: ["luke@assembledmedia.com.au"],
}

const SAMANTHA_KEAH: TeamMemberIdentity = {
  canonicalEmail: "samantha.keah@assembledmedia.com.au",
  name: "Samantha Keah",
  aliases: ["samantha@assembledmedia.com.au"],
}

const SAMANTHA_MURPHY: TeamMemberIdentity = {
  canonicalEmail: "samantha.murphy@assembledmedia.com.au",
  name: "Samantha Murphy",
  aliases: ["samantha@assembledmedia.com.au"],
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

  it("declines when two roster rows share the alias — never first-row wins", () => {
    const hit = resolveRosterEmail("samantha@assembledmedia.com.au", [
      SAMANTHA_KEAH,
      SAMANTHA_MURPHY,
    ])
    assert.equal(hit, null)
  })
})

describe("resolveRosterEmailResult", () => {
  it("reports both holders on a colliding alias", () => {
    const result = resolveRosterEmailResult(
      "SAMANTHA@assembledmedia.com.au",
      [SAMANTHA_KEAH, SAMANTHA_MURPHY]
    )
    assert.equal(result.kind, "ambiguous")
    if (result.kind === "ambiguous") {
      assert.deepEqual(
        result.members.map((m) => m.canonicalEmail).toSorted(),
        [
          SAMANTHA_KEAH.canonicalEmail,
          SAMANTHA_MURPHY.canonicalEmail,
        ]
      )
    }
  })

  it("is unique for an alias that belongs to one person", () => {
    const result = resolveRosterEmailResult(
      "luke@assembledmedia.com.au",
      [LUKE, SAMANTHA_KEAH]
    )
    assert.equal(result.kind, "unique")
    if (result.kind === "unique") {
      assert.equal(result.member.canonicalEmail, LUKE.canonicalEmail)
    }
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

  it("omits a colliding alias rather than picking a person", () => {
    const people = uniquePeopleFromEmails(
      ["samantha@assembledmedia.com.au", "client@acme.com"],
      [SAMANTHA_KEAH, SAMANTHA_MURPHY]
    )
    assert.deepEqual(people, [])
  })
})
