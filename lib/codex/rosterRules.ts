import { isUniqueViolation, sqlStateOf } from "@/lib/db/pgError"
import { normaliseEmail } from "@/lib/email/address"
import { isFreeMailDomain } from "@/lib/fireflies/learnableDomains"

import { AliasCollisionError } from "./rosterAliasGuard"
import { looksLikeEmail, rosterDisplayName, type RosterPerson } from "./rosterResolve"

/**
 * The roster rules (S18 A, B53). Pure. Every roster write runs through
 * `prepareRosterWrite` when the `roster_rules` switch is on: the Team tab add
 * and edit (`createTeamMember`, `updateTeamMember`) and the Auth0 login and
 * sync inserts (`newRosterRow`).
 *
 *   1. Every person has a primary address (one email address).
 *   2. A name never holds an email address (no "@").
 *   3. An address (primary or alias) belongs to one person across the whole
 *      roster, active or not. Migration 0119 enforces 2 and 3 in Postgres.
 *   4. Everyone gets an initials alias: `initialsAliasOf`. It is added when
 *      no one holds it. When someone else holds it, it is not added and the
 *      Team tab lists the clash for a manual alias (C-58: never pick one of
 *      two).
 */

export type RosterRuleField = "email" | "name" | "email_aliases"

export type RosterRuleProblem = { field: RosterRuleField; message: string }

export type RosterWrite = { email: string; name: string; aliases: string[] }

export class RosterRuleError extends Error {
  readonly code = "roster_rule"
  constructor(readonly problems: RosterRuleProblem[]) {
    super(problems.map((p) => p.message).join(" "))
    this.name = "RosterRuleError"
  }
}

/**
 * First letter of each name part, upper case. A part that does not start with A to Z adds nothing.
 * shortcut: a part starting with an accented letter (Élodie) adds nothing, upgrade with the B53 SQL rule when the roster has one.
 */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .filter((c) => /^[A-Z]$/.test(c))
    .join("")
}

/**
 * The person's initials alias: initials (from the shown name) at the primary
 * address's domain, lower case. None for a free-mail domain (that address is
 * a stranger's mailbox) or a name with no initials.
 */
export function initialsAliasOf(person: { email: string; name: string }): string | null {
  const email = normaliseEmail(person.email)
  const domain = email.slice(email.lastIndexOf("@") + 1)
  const initials = initialsOf(rosterDisplayName(person)).toLowerCase()
  if (!initials || !email.includes("@") || !domain || isFreeMailDomain(domain)) return null
  return `${initials}@${domain}`
}

function addressesOf(row: RosterPerson): string[] {
  return [row.email, ...(row.aliases ?? [])].map(normaliseEmail).filter(Boolean)
}

/** Who else holds `address` (any row but the owner's, active or not). */
function holderOf(address: string, others: readonly RosterPerson[]): RosterPerson | undefined {
  return others.find((row) => addressesOf(row).includes(address))
}

/**
 * The row to store, or a RosterRuleError naming each field that breaks a
 * rule. `ownerEmail` is the row's stored primary before an edit; that row is
 * left out of the uniqueness check. A new row leaves it out.
 */
export function prepareRosterWrite(
  candidate: RosterWrite,
  roster: readonly RosterPerson[],
  ownerEmail?: string
): RosterWrite {
  const email = normaliseEmail(candidate.email)
  const name = candidate.name.trim()
  const aliases = [...new Set(candidate.aliases.map(normaliseEmail))].filter((a) => a && a !== email)
  const owner = ownerEmail === undefined ? null : normaliseEmail(ownerEmail)
  const others = roster.filter((row) => normaliseEmail(row.email) !== owner)
  const problems: RosterRuleProblem[] = []

  if (!email) problems.push({ field: "email", message: "Add a primary email address." })
  else if (!looksLikeEmail(email)) problems.push({ field: "email", message: `${email} is not one email address.` })
  if (!name) problems.push({ field: "name", message: "Add a name." })
  else if (name.includes("@")) {
    problems.push({ field: "name", message: "The name holds an email address. Use the person's name, such as Alex James." })
  }
  for (const alias of aliases) {
    if (!looksLikeEmail(alias)) problems.push({ field: "email_aliases", message: `${alias} is not an email address.` })
  }
  const held: Array<[RosterRuleField, string]> = [["email", email], ...aliases.map((a): [RosterRuleField, string] => ["email_aliases", a])]
  for (const [field, address] of held) {
    const holder = address ? holderOf(address, others) : undefined
    if (holder) problems.push({ field, message: `${address} already belongs to ${rosterDisplayName(holder)}.` })
  }
  if (problems.length > 0) throw new RosterRuleError(problems)

  const initials = initialsAliasOf({ email, name })
  if (initials && initials !== email && !aliases.includes(initials) && !holderOf(initials, others)) aliases.push(initials)
  return { email, name, aliases }
}

export type InitialsGap = {
  email: string
  name: string
  initials: string
  /** The alias the rule gives, or null when none can be made (free-mail domain, no initials). */
  alias: string | null
  /** Who holds that alias, or the other people whose initials alias is the same. */
  sharedWith: string[]
}

/**
 * Active people without their initials alias who need a manual alias: the
 * alias is held by someone else, or two people would get the same one, or
 * none can be made. People whose alias is free are not listed: the next
 * save or the B53 script adds it.
 */
export function listInitialsGaps(roster: readonly RosterPerson[]): InitialsGap[] {
  const wanted = roster.map((row) => ({ row, alias: initialsAliasOf(row) }))
  const gaps: InitialsGap[] = []
  for (const { row, alias } of wanted) {
    if (row.active === false) continue
    if (alias && addressesOf(row).includes(alias)) continue
    const others = roster.filter((r) => r !== row)
    const sharedWith = alias
      ? [
          ...new Set([
            ...others.filter((r) => addressesOf(r).includes(alias)),
            ...wanted.filter((w) => w.row !== row && w.alias === alias).map((w) => w.row),
          ]),
        ].map((r) => rosterDisplayName(r))
      : []
    if (alias && sharedWith.length === 0) continue
    gaps.push({
      email: normaliseEmail(row.email),
      name: rosterDisplayName(row),
      initials: initialsOf(rosterDisplayName(row)),
      alias,
      sharedWith,
    })
  }
  return gaps.toSorted((a, b) => a.name.localeCompare(b.name))
}

export type RosterWriteRefusal = {
  status: 400 | 409
  body: { error: string; message: string; field?: RosterRuleField; problems?: RosterRuleProblem[] }
}

/**
 * The answer to a Team tab add or edit that a roster rule refused, or null
 * for any other error. Covers this module's rules, the alias guard before
 * B53, and Postgres refusing the row (0119's address trigger and name check,
 * or a primary email already on the list) with a plain message, never the
 * database's own text.
 */
export function rosterWriteRefusal(error: unknown): RosterWriteRefusal | null {
  if (error instanceof RosterRuleError) {
    return {
      status: 400,
      body: { error: "roster_rule", message: error.message, field: error.problems[0]?.field, problems: error.problems },
    }
  }
  if (error instanceof AliasCollisionError) return { status: 409, body: { error: "alias_collision", message: error.message } }
  if (isUniqueViolation(error)) {
    return { status: 409, body: { error: "alias_collision", message: "That email address already belongs to someone on the team list." } }
  }
  if (sqlStateOf(error) === "23514") {
    return { status: 400, body: { error: "roster_rule", message: "The team list refused this row: a name holds an email address, or a field is in the wrong form. Nothing was saved." } }
  }
  return null
}
