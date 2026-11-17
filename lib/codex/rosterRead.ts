/**
 * Roster rows for people resolution (F16, B36). Read only; owner connection.
 * Kept apart from repo.ts so routes can resolve without pulling the repo.
 */
import "server-only"

import { db, type Db } from "@/db"
import { teamMembers } from "@/db/schema"
import { isFeatureOn } from "@/lib/features/server"

import type { RosterPerson } from "./rosterResolve"

export async function loadRosterPeople(database: Pick<Db, "select"> = db): Promise<RosterPerson[]> {
  const rows = await database
    .select({
      email: teamMembers.email,
      name: teamMembers.name,
      emailAliases: teamMembers.emailAliases,
      active: teamMembers.active,
    })
    .from(teamMembers)
  return rows.map((r) => ({
    email: r.email,
    name: r.name,
    aliases: Array.isArray(r.emailAliases) ? r.emailAliases.filter((a): a is string => typeof a === "string") : [],
    active: r.active,
  }))
}

/** The `roster_rules` switch (B53). A failed read is off: the writes before B53. */
export function rosterRulesOn(): Promise<boolean> {
  return isFeatureOn("roster_rules").catch(() => false)
}
