/**
 * B53 (S18 A) against a real Postgres: the Team tab writes through the
 * roster rules (switch on and off), migration 0119 (it refuses while rows
 * break a rule and lists them; then its trigger and checks refuse a bad
 * row whoever writes it), the refusal a route sends for each, and the B53
 * alias script on a live-shaped roster.
 *
 * Skips unless CODEX_PROJECTS_TEST_DATABASE_URL names a LOCAL database whose
 * name ends in `_codex_test`. It works in a sibling database
 * `<name>_roster_codex_test` (created if missing) and rebuilds its public
 * schema. It never reads .env.local.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { after, before, beforeEach, describe, it } from "node:test"

import { drizzle } from "drizzle-orm/postgres-js"
import type postgres from "postgres"

import * as schema from "@/db/schema"
import type { Db } from "@/db"
import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { FeatureRow } from "../../features/registry.js"
import { createTeamMember, updateTeamMember } from "../repo.js"
import { RosterRuleError, rosterWriteRefusal } from "../rosterRules.js"
import { BASE_SQL, createDatabase, RAW_URL, siblingUrl } from "./codexTestDb.js"

const URL_ = siblingUrl(RAW_URL, "roster")
const skip = URL_ ? false : "set CODEX_PROJECTS_TEST_DATABASE_URL to a local *_codex_test database"
const D = "assembledmedia.com.au"
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")
const MIGRATION = read("db/migrations/0119_team_members_roster_rules.sql")
const ALIAS_SCRIPT = read("sql/supabase/2026-11-18_B53_roster_initials_aliases_SUPABASE.sql")

/** The live roster's shape on 18 Nov 2026 (names changed where they are not in the brief). */
const LIVE_SHAPED = `
INSERT INTO public.team_members (email, name, email_aliases, active) VALUES
 ('jenny.rojas@${D}', 'Jenny Rojas', '["jenny@${D}"]', true),
 ('graduate@${D}', 'Grad Person', '[]', true),
 ('andrew@assembled.com.au', 'Andrew Lee', '[]', true),
 ('someone@gmail.com', 'Test Account', '[]', false),
 ('samantha.keah@${D}', 'Samantha Keah', '["samantha@${D}"]', true),
 ('luke.fitzpatrick@${D}', 'luke.fitzpatrick@${D}', '["luke@${D}"]', true),
 ('samantha.murphy@${D}', 'Samantha Murphy', '["samantha@${D}"]', true),
 ('alex.james@${D}', 'alex.james@${D}', '["alex@${D}"]', true);
`

function row(key: string, enabled: boolean): FeatureRow {
  return { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null }
}
const rulesSwitch = (on: boolean) => setFeatureRowReaderForTests(async () => new Map([["roster_rules", row("roster_rules", on)]]))

async function caught(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (err) {
    return err
  }
  assert.fail("expected the write to be refused")
}

describe("roster rules on Postgres (B53, 0119)", { skip }, () => {
  let client: ReturnType<typeof postgres>
  let database: Db
  const aliasesOf = async (email: string) =>
    ((await client`SELECT email_aliases FROM public.team_members WHERE email = ${email}`)[0]?.email_aliases ?? null) as string[] | null

  before(async () => {
    client = await createDatabase(URL_!)
    database = drizzle(client, { schema }) as unknown as Db
  })
  beforeEach(async () => {
    await client.unsafe(BASE_SQL)
    await client.unsafe(LIVE_SHAPED)
  })
  after(async () => {
    setFeatureRowReaderForTests(null)
    await client?.end({ timeout: 5 })
  })

  it("switch off: the Team tab saves as before (a name that is an email, no initials alias)", async () => {
    rulesSwitch(false)
    const member = await createTeamMember({ email: `new.person@${D}`, name: `new.person@${D}` }, null, database)
    assert.equal(member.name, `new.person@${D}`)
    assert.deepEqual(member.email_aliases, [])
  })

  it("switch on: a new member gets the initials alias; a name holding an email is refused naming the field", async () => {
    rulesSwitch(true)
    const member = await createTeamMember({ email: `Clay.Deuna@${D}`, name: " Clay Deuna " }, null, database)
    assert.deepEqual([member.email, member.name, member.email_aliases], [`clay.deuna@${D}`, "Clay Deuna", [`cd@${D}`]])
    const err = await caught(() => createTeamMember({ email: `new.person@${D}`, name: `new.person@${D}` }, null, database))
    assert.ok(err instanceof RosterRuleError)
    assert.equal(err.problems[0]?.field, "name")
    assert.equal(await aliasesOf(`new.person@${D}`), null)
  })

  it("switch on: an edit checks the whole row (a toggle on a row whose name is an email is refused until renamed)", async () => {
    rulesSwitch(true)
    const [luke] = await client`SELECT id FROM public.team_members WHERE email = ${`luke.fitzpatrick@${D}`}`
    const err = await caught(() => updateTeamMember(Number(luke.id), { active: true }, null, database))
    assert.ok(err instanceof RosterRuleError)
    assert.deepEqual(err.problems.map((p) => p.field), ["name"])
    const renamed = await updateTeamMember(Number(luke.id), { name: "Luke Fitzpatrick" }, null, database)
    assert.deepEqual(renamed?.email_aliases, [`luke@${D}`, `lf@${D}`])
  })

  it("switch on: an alias an inactive person holds is refused; the shared samantha@ blocks any edit of either holder", async () => {
    rulesSwitch(true)
    const [keah] = await client`SELECT id FROM public.team_members WHERE email = ${`samantha.keah@${D}`}`
    const err = await caught(() => updateTeamMember(Number(keah.id), { roleTitle: "Planner" }, null, database))
    assert.ok(err instanceof RosterRuleError)
    assert.match(err.message, /samantha@assembledmedia\.com\.au already belongs to Samantha Murphy/)
    const ok = await updateTeamMember(Number(keah.id), { emailAliases: [] }, null, database)
    assert.deepEqual(ok?.email_aliases, [`sk@${D}`])
    const gone = await caught(() => createTeamMember({ email: `new.person@${D}`, name: "New Person", emailAliases: ["someone@gmail.com"] }, null, database))
    assert.ok(gone instanceof RosterRuleError)
    const goneOnEdit = await caught(() => updateTeamMember(Number(keah.id), { emailAliases: ["someone@gmail.com"] }, null, database))
    assert.ok(goneOnEdit instanceof RosterRuleError)
  })

  it("0119 refuses with nothing done while rows break a rule, and lists them", async () => {
    const err = await caught(() => client.unsafe(MIGRATION))
    const message = String((err as Error).message)
    assert.match(message, /0119 refused, nothing done/)
    assert.match(message, /samantha@assembledmedia\.com\.au is held by team_members \d+ and \d+/)
    assert.equal((message.match(/the name holds an email address/g) ?? []).length, 2)
    const [marker] = await client`SELECT count(*)::int AS n FROM public.migration_markers WHERE key = '0119_team_members_roster_rules'`
    assert.equal(marker.n, 0)
  })

  it("the alias script, then renames, then 0119: Murphy keeps samantha@, everyone gains initials, the database refuses a bad row", async () => {
    await client.unsafe(ALIAS_SCRIPT)
    assert.deepEqual(await aliasesOf(`samantha.keah@${D}`), [`sk@${D}`])
    assert.deepEqual(await aliasesOf(`samantha.murphy@${D}`), [`samantha@${D}`, `sm@${D}`])
    assert.deepEqual(await aliasesOf(`luke.fitzpatrick@${D}`), [`luke@${D}`, `lf@${D}`])
    assert.deepEqual(await aliasesOf(`andrew@assembled.com.au`), [`al@assembled.com.au`])
    assert.deepEqual(await aliasesOf("someone@gmail.com"), [])
    const [{ n: initials }] = await client`SELECT count(*)::int AS n FROM public.team_members WHERE email_aliases::text ~ '"[a-z]{2}@'`
    assert.equal(initials, 7)
    await client.unsafe(ALIAS_SCRIPT) // a second run changes nothing
    assert.deepEqual(await aliasesOf(`samantha.murphy@${D}`), [`samantha@${D}`, `sm@${D}`])

    await client`UPDATE public.team_members SET name = 'Luke Fitzpatrick' WHERE email = ${`luke.fitzpatrick@${D}`}`
    await client`UPDATE public.team_members SET name = 'Alex James' WHERE email = ${`alex.james@${D}`}`
    await client.unsafe(MIGRATION)
    await client.unsafe(MIGRATION) // the marker makes a second run a no-op

    rulesSwitch(false) // the database refuses even when the app's rules are off
    const taken = await caught(() => createTeamMember({ email: `new.person@${D}`, name: "New Person", emailAliases: [`SM@${D}`] }, null, database))
    assert.deepEqual([rosterWriteRefusal(taken)?.status, rosterWriteRefusal(taken)?.body.error], [409, "alias_collision"])
    const primaryIsAlias = await caught(() => createTeamMember({ email: `samantha@${D}`, name: "Someone" }, null, database))
    assert.equal(rosterWriteRefusal(primaryIsAlias)?.status, 409)
    const named = await caught(() => createTeamMember({ email: `new.person@${D}`, name: `new.person@${D}` }, null, database))
    assert.deepEqual([rosterWriteRefusal(named)?.status, rosterWriteRefusal(named)?.body.error], [400, "roster_rule"])
    const [{ n }] = await client`SELECT count(*)::int AS n FROM public.team_members WHERE email = ${`new.person@${D}`} OR email = ${`samantha@${D}`}`
    assert.equal(n, 0)
    const own = await client`UPDATE public.team_members SET email_aliases = email_aliases WHERE email = ${`samantha.murphy@${D}`} RETURNING id`
    assert.equal(own.length, 1, "a row may keep its own addresses")
  })
})
