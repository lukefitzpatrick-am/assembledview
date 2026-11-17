/**
 * B53 (S18 A): the roster rules. One validator for every roster write, the
 * initials alias rule, the Team tab clash report and the refusal a team
 * route sends. Pure: no database.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AliasCollisionError, listAliasCollisions } from "../rosterAliasGuard.js"
import { resolveRosterAddress, resolveRosterMention, type RosterPerson } from "../rosterResolve.js"
import {
  initialsAliasOf,
  initialsOf,
  listInitialsGaps,
  prepareRosterWrite,
  RosterRuleError,
  rosterWriteRefusal,
  type RosterRuleField,
  type RosterWrite,
} from "../rosterRules.js"

const D = "x.au"
const MURPHY: RosterPerson = { email: `samantha.murphy@${D}`, name: "Samantha Murphy", aliases: [`samantha@${D}`], active: true }
const KEAH: RosterPerson = { email: `samantha.keah@${D}`, name: "Samantha Keah", aliases: [], active: true }
const GONE: RosterPerson = { email: `old.hand@${D}`, name: "Old Hand", aliases: [`old@${D}`], active: false }
const ROSTER = [MURPHY, KEAH, GONE]

function refused(write: RosterWrite, roster: readonly RosterPerson[] = ROSTER, owner?: string): RosterRuleError {
  try {
    prepareRosterWrite(write, roster, owner)
  } catch (err) {
    assert.ok(err instanceof RosterRuleError)
    return err
  }
  assert.fail("expected a refusal")
}

describe("initialsOf and initialsAliasOf", () => {
  const cases: Array<[string, string]> = [
    ["Samantha Murphy", "SM"],
    ["  mary   o'brien ", "MO"],
    ["Jo Anne de Vries", "JADV"],
    ["Zoë 3rd", "Z"],
    ["", ""],
  ]
  for (const [name, want] of cases) it(`${JSON.stringify(name)} is ${JSON.stringify(want)}`, () => assert.equal(initialsOf(name), want))

  it("is the lower-case initials at the primary's domain", () => {
    assert.equal(initialsAliasOf({ email: `Samantha.Murphy@${D}`, name: "Samantha Murphy" }), `sm@${D}`)
  })
  it("reads a name that is an email as the shown name", () => {
    assert.equal(initialsAliasOf({ email: `alex.james@${D}`, name: `alex.james@${D}` }), `aj@${D}`)
  })
  it("is none for a free-mail domain or a name with no initials", () => {
    assert.equal(initialsAliasOf({ email: "someone@gmail.com", name: "Some One" }), null)
    assert.equal(initialsAliasOf({ email: `x@${D}`, name: "123" }), null)
  })
})

describe("prepareRosterWrite: the four rules, each refusal names its field", () => {
  const table: Array<[string, RosterWrite, RosterRuleField, RegExp]> = [
    ["primary missing", { email: " ", name: "New Person", aliases: [] }, "email", /Add a primary email/],
    ["primary not one address", { email: "new person@x", name: "New Person", aliases: [] }, "email", /not one email address/],
    ["name missing", { email: `new.person@${D}`, name: "  ", aliases: [] }, "name", /Add a name/],
    ["name holds an email", { email: `new.person@${D}`, name: `new.person@${D}`, aliases: [] }, "name", /holds an email address/],
    ["alias not an address", { email: `new.person@${D}`, name: "New Person", aliases: ["np"] }, "email_aliases", /np is not an email address/],
    ["alias held by an active person", { email: `new.person@${D}`, name: "New Person", aliases: [`samantha@${D}`] }, "email_aliases", /samantha@x\.au already belongs to Samantha Murphy/],
    ["alias held by an inactive person", { email: `new.person@${D}`, name: "New Person", aliases: [`OLD@${D}`] }, "email_aliases", /old@x\.au already belongs to Old Hand/],
    ["primary is someone's alias", { email: `samantha@${D}`, name: "New Person", aliases: [] }, "email", /samantha@x\.au already belongs to Samantha Murphy/],
    ["primary is someone's primary", { email: `samantha.keah@${D}`, name: "New Person", aliases: [] }, "email", /already belongs to Samantha Keah/],
  ]
  for (const [label, write, field, message] of table) {
    it(label, () => {
      const err = refused(write)
      assert.equal(err.problems[0]?.field, field)
      assert.match(err.message, message)
    })
  }

  it("lists every broken rule at once", () => {
    const err = refused({ email: `samantha@${D}`, name: "a@b.c", aliases: ["bad"] })
    assert.deepEqual(err.problems.map((p) => p.field).sort(), ["email", "email_aliases", "name"])
  })

  it("stores trimmed lower-case addresses, drops a repeat and its own primary, and adds the initials alias", () => {
    const out = prepareRosterWrite(
      { email: ` New.Person@${D} `, name: " New Person ", aliases: [`NP2@${D}`, `np2@${D}`, `new.person@${D}`, ""] },
      ROSTER
    )
    assert.deepEqual(out, { email: `new.person@${D}`, name: "New Person", aliases: [`np2@${D}`, `np@${D}`] })
  })

  it("an edit leaves the person's own row out of the uniqueness check", () => {
    const out = prepareRosterWrite({ email: MURPHY.email, name: MURPHY.name, aliases: [`samantha@${D}`] }, ROSTER, MURPHY.email)
    assert.deepEqual(out.aliases, [`samantha@${D}`, `sm@${D}`])
  })

  it("an edit that changes the primary is still checked against everyone else", () => {
    const err = refused({ email: `samantha.keah@${D}`, name: "Samantha Murphy", aliases: [] }, ROSTER, MURPHY.email)
    assert.equal(err.problems[0]?.field, "email")
  })

  it("never takes an initials alias someone else holds (C-58): saved without it, no refusal", () => {
    const sarah = prepareRosterWrite({ email: `sarah.mills@${D}`, name: "Sarah Mills", aliases: [] }, [
      { ...MURPHY, aliases: [`sm@${D}`] },
    ])
    assert.deepEqual(sarah.aliases, [])
  })

  it("a free-mail primary gets no initials alias", () => {
    assert.deepEqual(prepareRosterWrite({ email: "someone@gmail.com", name: "Some One", aliases: [] }, []).aliases, [])
  })
})

describe("listInitialsGaps: the Team tab asks for a manual alias, never picks one of two", () => {
  it("lists both people when two would get the same alias and neither holds it", () => {
    const gaps = listInitialsGaps([
      { email: `sarah.mills@${D}`, name: "Sarah Mills", aliases: [] },
      { email: `sam.moss@${D}`, name: "Sam Moss", aliases: [] },
    ])
    assert.deepEqual(
      gaps.map((g) => [g.name, g.alias, g.sharedWith]),
      [
        ["Sam Moss", `sm@${D}`, ["Sarah Mills"]],
        ["Sarah Mills", `sm@${D}`, ["Sam Moss"]],
      ]
    )
  })

  it("lists only the person without it when someone holds it", () => {
    const gaps = listInitialsGaps([
      { ...MURPHY, aliases: [`sm@${D}`] },
      { email: `sarah.mills@${D}`, name: "Sarah Mills", aliases: [] },
    ])
    assert.deepEqual(gaps.map((g) => [g.name, g.initials, g.sharedWith]), [["Sarah Mills", "SM", ["Samantha Murphy"]]])
  })

  it("does not list a free alias (the next save adds it), an inactive person, or someone who has it", () => {
    assert.deepEqual(listInitialsGaps([KEAH, { ...GONE, email: "gone@gmail.com" }, { ...MURPHY, aliases: [`sm@${D}`] }]), [])
  })

  it("lists an active person no alias can be made for", () => {
    assert.deepEqual(listInitialsGaps([{ email: "free@gmail.com", name: "Free Mail" }]).map((g) => [g.alias, g.sharedWith]), [[null, []]])
  })
})

describe("rosterWriteRefusal: a plain answer, never the database's text", () => {
  it("a rule refusal is 400 naming the field", () => {
    const out = rosterWriteRefusal(refused({ email: `n.p@${D}`, name: `n.p@${D}`, aliases: [] }))
    assert.equal(out?.status, 400)
    assert.equal(out?.body.error, "roster_rule")
    assert.equal(out?.body.field, "name")
  })
  it("the pre-B53 alias guard is 409, as before", () => {
    const out = rosterWriteRefusal(new AliasCollisionError(`samantha@${D}`, { email: MURPHY.email, name: MURPHY.name }))
    assert.deepEqual([out?.status, out?.body.error], [409, "alias_collision"])
  })
  it("Postgres refusing the row (0119 trigger, a primary already listed, the name check) is plain", () => {
    const secret = "Failed query: insert into team_members ... params: secret@x.au"
    const unique = rosterWriteRefusal({ message: secret, cause: { code: "23505", message: secret } })
    assert.equal(unique?.status, 409)
    assert.doesNotMatch(JSON.stringify(unique), /secret|Failed query/)
    const check = rosterWriteRefusal({ message: secret, cause: { code: "23514" } })
    assert.equal(check?.status, 400)
    assert.doesNotMatch(JSON.stringify(check), /secret|Failed query/)
  })
  it("any other error is not a roster refusal", () => {
    assert.equal(rosterWriteRefusal(new Error("boom")), null)
    assert.equal(rosterWriteRefusal({ code: "40P01" }), null)
  })
})

describe("item 5: with the rules met, the resolver always finds one person (the C-58 branch stays as the guard)", () => {
  it("every address and initials mention of a roster built through prepareRosterWrite resolves to its owner", () => {
    const people: RosterPerson[] = []
    for (const [email, name, aliases] of [
      [`samantha.murphy@${D}`, "Samantha Murphy", [`samantha@${D}`]],
      [`samantha.keah@${D}`, "Samantha Keah", []],
      [`alex.james@${D}`, "Alex James", [`alex@${D}`]],
      [`graduate@${D}`, "Josh Plumridge", []],
    ] as const) {
      const row = prepareRosterWrite({ email, name, aliases: [...aliases] }, people)
      people.push({ email: row.email, name: row.name, aliases: row.aliases, active: true })
    }
    assert.deepEqual(listAliasCollisions(people.map((p) => ({ ...p, aliases: [...(p.aliases ?? [])] }))), [])
    for (const person of people) {
      for (const address of [person.email, ...(person.aliases ?? [])]) {
        const match = resolveRosterAddress(address, people, { aliases: true })
        assert.equal(match.kind, "unique", address)
        assert.equal(match.kind === "unique" && match.member.email, person.email)
      }
      const initials = initialsOf(person.name).toLowerCase()
      const mention = resolveRosterMention(`@${initials}`, people, { aliases: true })
      assert.equal(mention.kind === "unique" && mention.member.email, person.email, `@${initials}`)
    }
  })
})
