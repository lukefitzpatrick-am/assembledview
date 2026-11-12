/**
 * F16 (B36): one roster resolver for assignees, @mentions and meeting
 * attendees. Fixture mirrors the live roster shapes on 13 Nov 2026 (names
 * changed): a name that is an email, a person on a role mailbox, a shared
 * alias, an inactive row.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ambiguousAssigneeMessage,
  decideAssigneeWrite,
  displayNameFromEmail,
  looksLikeEmail,
  resolveRosterAddress,
  resolveRosterMention,
  rosterDisplayName,
  type RosterPerson,
} from "../rosterResolve.js"
import { resolveRosterEmailResult } from "../../fireflies/rosterAliases.js"
import { parseQuickAdd } from "../quickAddParse.js"

const D = "assembledmedia.com.au"
const alex: RosterPerson = { email: `alex.james@${D}`, name: `alex.james@${D}`, aliases: [`alex@${D}`] }
const josh: RosterPerson = { email: `graduate@${D}`, name: "Josh Plumridge", aliases: [] }
const samK: RosterPerson = { email: `samantha.keah@${D}`, name: "Samantha Keah", aliases: [`samantha@${D}`] }
const samM: RosterPerson = { email: `samantha.murphy@${D}`, name: "Samantha Murphy", aliases: [`samantha@${D}`] }
const brad: RosterPerson = { email: `brad.easton@${D}`, name: "Brad Easton", aliases: [`brad@${D}`] }
const gone: RosterPerson = { email: `old.timer@${D}`, name: "Old Timer", aliases: [`old@${D}`], active: false }
const roster = [alex, josh, samK, samM, brad, gone]

const ON = { aliases: true }
const OFF = { aliases: false }

test("address: the primary email always resolves, any case", () => {
  assert.deepEqual(resolveRosterAddress(`  Brad.Easton@${D.toUpperCase()} `, roster, OFF), { kind: "unique", member: brad, via: "primary" })
  assert.deepEqual(resolveRosterAddress(`graduate@${D}`, roster, OFF), { kind: "unique", member: josh, via: "primary" })
})

test("address: an alias resolves only when aliases count", () => {
  assert.deepEqual(resolveRosterAddress(`alex@${D}`, roster, ON), { kind: "unique", member: alex, via: "alias" })
  assert.deepEqual(resolveRosterAddress(`alex@${D}`, roster, OFF), { kind: "none" })
})

test("address: an alias shared by two people is ambiguous, never one of them", () => {
  const r = resolveRosterAddress(`samantha@${D}`, roster, ON)
  assert.equal(r.kind, "ambiguous")
  assert.deepEqual(r.kind === "ambiguous" ? r.candidates : [], [samK, samM])
})

test("address: a primary email that is also someone else's alias is ambiguous", () => {
  const clash: RosterPerson = { email: `x@${D}`, name: "X", aliases: [`brad.easton@${D}`] }
  assert.equal(resolveRosterAddress(`brad.easton@${D}`, [...roster, clash], ON).kind, "ambiguous")
  assert.equal(resolveRosterAddress(`brad.easton@${D}`, [...roster, clash], OFF).kind, "unique")
})

test("address: inactive people and empty input never match", () => {
  assert.deepEqual(resolveRosterAddress(`old.timer@${D}`, roster, ON), { kind: "none" })
  assert.deepEqual(resolveRosterAddress(`old@${D}`, roster, ON), { kind: "none" })
  assert.deepEqual(resolveRosterAddress("", roster, ON), { kind: "none" })
  assert.deepEqual(resolveRosterAddress(null, roster, ON), { kind: "none" })
})

test("display name: a name that is an email shows as a name; real names unchanged", () => {
  assert.equal(looksLikeEmail(alex.name), true)
  assert.equal(rosterDisplayName(alex), "Alex James")
  assert.equal(rosterDisplayName(josh), "Josh Plumridge")
  assert.equal(rosterDisplayName({ name: "", email: `graduate@${D}` }), "Graduate")
  assert.equal(rosterDisplayName({ name: null, email: null }), "")
  assert.equal(rosterDisplayName({ name: "  ", email: `jenny.rojas@${D}` }), "Jenny Rojas")
  assert.equal(displayNameFromEmail(`first_last-name+tag@${D}`), "First Last Name Tag")
  assert.equal(rosterDisplayName({ name: "Ann (Finance)", email: `ann@${D}` }), "Ann (Finance)")
})

test("mention: local part, alias local part, display name, partial name", () => {
  const unique = (token: string, opts = ON) => {
    const r = resolveRosterMention(token, roster, opts)
    return r.kind === "unique" ? r.member : r.kind
  }
  assert.equal(unique("@graduate"), josh)
  assert.equal(unique("@josh"), josh)
  assert.equal(unique("@brad"), brad)
  assert.equal(unique("@brad", OFF), brad, "brad matches by name with aliases off")
  assert.equal(unique("@alex"), alex)
  assert.equal(unique("@alex", OFF), alex, "partial display name")
  assert.equal(unique("@alexjames"), alex)
  assert.equal(unique(`@alex@${D}`), alex)
  assert.equal(unique(`@alex@${D}`, OFF), "none")
  assert.equal(unique("@Josh Plumridge".split(" ")[0]!), josh)
  assert.equal(unique("@nobody"), "none")
  assert.equal(unique("@"), "none")
  assert.equal(unique("@--"), "none")
  assert.equal(unique("@old"), "none", "inactive")
})

test("mention: a shared alias local part is ambiguous; a shared first name is never picked", () => {
  const r = resolveRosterMention("@samantha", roster, ON)
  assert.equal(r.kind, "ambiguous")
  // Aliases off: two partial name hits is no match, as before.
  assert.equal(resolveRosterMention("@samantha", roster, OFF).kind, "none")
  // Two people with the same local part on different domains: ambiguous, not first row.
  const twin: RosterPerson = { email: "brad.easton@other.example", name: "Brad E (Other)" }
  assert.equal(resolveRosterMention("@brad.easton", [brad, twin], OFF).kind, "ambiguous")
  assert.equal(resolveRosterMention("@brad.easton", [twin, brad], OFF).kind, "ambiguous")
})

test("Fireflies attendee resolution goes through the same resolver (aliases on)", () => {
  const identities = roster
    .filter((p) => p.active !== false)
    .map((p) => ({ canonicalEmail: p.email, name: p.name, aliases: [...(p.aliases ?? [])] }))
  const alexIdentity = identities[0]!
  assert.deepEqual(resolveRosterEmailResult(`ALEX@${D}`, identities), { kind: "unique", member: alexIdentity })
  const shared = resolveRosterEmailResult(`samantha@${D}`, identities)
  assert.equal(shared.kind, "ambiguous")
  assert.equal(shared.kind === "ambiguous" ? shared.members.length : 0, 2)
  assert.deepEqual(resolveRosterEmailResult("someone@client.example", identities), { kind: "none" })
})

test("quick-add: @mention through the resolver, display name on the chip, shared alias kept in title", () => {
  const team = roster.map((p) => ({ email: p.email, name: p.name, aliases: p.aliases ? [...p.aliases] : [], active: p.active }))
  const now = new Date("2025-08-06T04:00:00.000Z")
  const a = parseQuickAdd({ text: "Brief @alex", team, clients: [], now })
  assert.equal(a.assigneeEmail, alex.email)
  assert.equal(a.assigneeName, "Alex James")
  assert.ok(a.chips.some((c) => c.label === "Assignee Alex James"))

  const s = parseQuickAdd({ text: "Brief @samantha", team, clients: [], aliases: true, now })
  assert.equal(s.assigneeFromToken, false)
  assert.match(s.title, /@samantha/)
  assert.ok(s.chips.some((c) => !c.ok && /matches 2 people/.test(c.label)))

  const off = parseQuickAdd({ text: `Brief @alex@${D}`, team, clients: [], now })
  assert.equal(off.assigneeFromToken, false, "alias addresses need the switch")
  const on = parseQuickAdd({ text: `Brief @alex@${D}`, team, clients: [], aliases: true, now })
  assert.equal(on.assigneeEmail, alex.email)
})

test("quick-add with codex_roster_aliases off matches as before F16: first row wins, no refusal (L6)", () => {
  const now = new Date("2025-08-06T04:00:00.000Z")
  const twins = [
    { email: `chris.a@${D}`, name: "Chris Smith" },
    { email: `chris.b@${D}`, name: "Chris Smith" },
  ]
  const off = parseQuickAdd({ text: "Call @chris.smith", team: twins, clients: [], now })
  assert.equal(off.assigneeEmail, `chris.a@${D}`, "switch off: the first row, as before")
  assert.equal(off.assigneeFromToken, true)
  assert.equal(off.chips.some((c) => /matches \d+ people/.test(c.label)), false)

  const on = parseQuickAdd({ text: "Call @chris.smith", team: twins, clients: [], aliases: true, now })
  assert.equal(on.assigneeFromToken, false, "switch on: a shared exact name is refused")
  assert.ok(on.chips.some((c) => !c.ok && /matches 2 people/.test(c.label)))

  // Several partial hits stay "no team match" either way.
  const team = roster.map((p) => ({ email: p.email, name: p.name, aliases: p.aliases ? [...p.aliases] : [], active: p.active }))
  const sam = parseQuickAdd({ text: "Brief @samantha", team, clients: [], now })
  assert.equal(sam.assigneeFromToken, false)
  assert.ok(sam.chips.some((c) => !c.ok && /no team match/.test(c.label)))
})

test("assignee write decision: alias to main email and display name; shared refused; unknown as sent", () => {
  assert.deepEqual(decideAssigneeWrite(`Alex@${D}`, "whatever", roster), {
    kind: "ok",
    email: `alex.james@${D}`,
    name: "Alex James",
    resolved: true,
  })
  assert.deepEqual(decideAssigneeWrite("Someone@Client.example", "S", roster), {
    kind: "ok",
    email: "Someone@Client.example",
    name: "S",
    resolved: false,
  })
  const shared = decideAssigneeWrite(`samantha@${D}`, null, roster)
  assert.equal(shared.kind, "ambiguous")
  if (shared.kind === "ambiguous") {
    assert.equal(
      ambiguousAssigneeMessage(shared),
      `samantha@${D} belongs to Samantha Keah and Samantha Murphy. Choose the person, not the shared address.`,
    )
  }
  assert.equal(decideAssigneeWrite(`old@${D}`, null, roster).kind, "ok", "inactive holder: saved as sent")
})
