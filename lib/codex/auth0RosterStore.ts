import { eq } from "drizzle-orm"

import { db, schema } from "@/db"

import type {
  RosterLoginStore,
  RosterSource,
  StoredRosterRow,
} from "./auth0LoginUpsert"
import type { RosterSyncStore } from "./auth0RosterSync"

function asAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function asSource(value: unknown): RosterSource {
  if (value === "auth0_login" || value === "auth0_sync" || value === "manual") {
    return value
  }
  return "manual"
}

function mapRow(row: typeof schema.teamMembers.$inferSelect): StoredRosterRow {
  return {
    email: row.email,
    name: row.name,
    auth0UserId: row.auth0UserId ?? null,
    emailAliases: asAliases(row.emailAliases),
    roleTitle: row.roleTitle ?? null,
    lastLoginAt: row.lastLoginAt ?? null,
    rosterSource: asSource(row.rosterSource),
  }
}

async function findByEmail(email: string): Promise<StoredRosterRow | null> {
  const [row] = await db
    .select()
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.email, email))
    .limit(1)
  return row ? mapRow(row) : null
}

async function insert(row: StoredRosterRow): Promise<void> {
  const now = row.lastLoginAt ?? new Date().toISOString()
  await db.insert(schema.teamMembers).values({
    email: row.email,
    name: row.name,
    auth0UserId: row.auth0UserId,
    emailAliases: row.emailAliases,
    rosterSource: row.rosterSource,
    lastLoginAt: row.lastLoginAt,
    createdAt: now,
    updatedAt: now,
  })
}

async function updateLoginFields(
  email: string,
  patch: { auth0UserId?: string; lastLoginAt?: string },
): Promise<void> {
  const values: Partial<typeof schema.teamMembers.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (patch.lastLoginAt !== undefined) values.lastLoginAt = patch.lastLoginAt
  if (patch.auth0UserId !== undefined) values.auth0UserId = patch.auth0UserId
  await db
    .update(schema.teamMembers)
    .set(values)
    .where(eq(schema.teamMembers.email, email))
}

async function listRoster(): Promise<StoredRosterRow[]> {
  const rows = await db.select().from(schema.teamMembers)
  return rows.map(mapRow)
}

export const postgresRosterStore: RosterLoginStore & RosterSyncStore = {
  findByEmail,
  insert,
  updateOnLogin: (email, patch) => updateLoginFields(email, patch),
  updateOnSync: (email, patch) => updateLoginFields(email, patch),
  listRoster,
}
