import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  AliasCollisionError,
  assertNewAliasesAvailable,
  dropCollidingNewAliases,
  listAliasCollisions,
} from "../rosterAliasGuard.js"

const KEAH = {
  email: "samantha.keah@assembledmedia.com.au",
  name: "Samantha Keah",
  aliases: ["samantha@assembledmedia.com.au"],
  active: true,
}

const MURPHY = {
  email: "samantha.murphy@assembledmedia.com.au",
  name: "Samantha Murphy",
  aliases: ["samantha@assembledmedia.com.au"],
  active: true,
}

describe("assertNewAliasesAvailable", () => {
  it("refuses a colliding alias and names the other holder", () => {
    assert.throws(
      () =>
        assertNewAliasesAvailable(
          ["samantha@assembledmedia.com.au"],
          [KEAH],
          MURPHY.email
        ),
      (err: unknown) => {
        assert.ok(err instanceof AliasCollisionError)
        assert.match(err.message, /samantha@assembledmedia\.com\.au/i)
        assert.match(err.message, /Samantha Keah/)
        assert.match(err.message, /samantha\.keah@assembledmedia\.com\.au/i)
        return true
      }
    )
  })

  it("allows a unique alias", () => {
    assert.doesNotThrow(() =>
      assertNewAliasesAvailable(
        ["sam.k@assembledmedia.com.au"],
        [KEAH],
        MURPHY.email
      )
    )
  })

  it("allows a person to keep their own alias", () => {
    assert.doesNotThrow(() =>
      assertNewAliasesAvailable(
        ["samantha@assembledmedia.com.au"],
        [KEAH],
        KEAH.email
      )
    )
  })
})

describe("dropCollidingNewAliases", () => {
  it("omits the colliding alias and names the holder", () => {
    const result = dropCollidingNewAliases(
      ["samantha@assembledmedia.com.au"],
      [KEAH],
      MURPHY.email
    )
    assert.deepEqual(result.accepted, [])
    assert.equal(result.refused.length, 1)
    assert.equal(result.refused[0]!.alias, "samantha@assembledmedia.com.au")
    assert.equal(result.refused[0]!.holder.email, KEAH.email)
    assert.equal(result.refused[0]!.holder.name, KEAH.name)
  })
})

describe("listAliasCollisions", () => {
  it("reports the existing samantha@ collision without picking a winner", () => {
    const collisions = listAliasCollisions([KEAH, MURPHY])
    assert.equal(collisions.length, 1)
    assert.equal(collisions[0]!.alias, "samantha@assembledmedia.com.au")
    assert.deepEqual(
      collisions[0]!.holders.map((h) => h.email).toSorted(),
      [KEAH.email, MURPHY.email]
    )
  })

  it("ignores inactive holders", () => {
    const collisions = listAliasCollisions([
      KEAH,
      { ...MURPHY, active: false },
    ])
    assert.deepEqual(collisions, [])
  })
})
