import type { User } from "@auth0/nextjs-auth0/types"

import { getUserRoles } from "@/lib/rbac"

import { displayNameFromEmail } from "@/lib/email/address"

import { shortFormEmailAlias } from "./rosterEmailAlias"
import { dropCollidingNewAliases } from "./rosterAliasGuard"
import { prepareRosterWrite, RosterRuleError } from "./rosterRules"

export const LOGIN_SYNC_DEBOUNCE_MS = 60 * 60 * 1000

export type RosterSource = "manual" | "auth0_login" | "auth0_sync"

export type StoredRosterRow = {
  email: string
  name: string
  auth0UserId: string | null
  emailAliases: string[]
  roleTitle: string | null
  lastLoginAt: string | null
  rosterSource: RosterSource
}

export type RosterLoginStore = {
  findByEmail(email: string): Promise<StoredRosterRow | null>
  listRoster(): Promise<StoredRosterRow[]>
  insert(row: StoredRosterRow): Promise<void>
  updateOnLogin(
    email: string,
    patch: { auth0UserId?: string; lastLoginAt: string },
  ): Promise<void>
}

export type LoginProfile = {
  email?: string | null
  name?: string | null
  sub?: string | null
}

const lastWriteByUser = new Map<string, number>()

export function resetLoginSyncDebounceForTests(): void {
  lastWriteByUser.clear()
}

function debounceKey(profile: LoginProfile, email: string): string {
  const sub = typeof profile.sub === "string" ? profile.sub.trim() : ""
  return sub || email
}

function isDebounced(key: string, nowMs: number): boolean {
  const prev = lastWriteByUser.get(key)
  if (prev == null) return false
  return nowMs - prev < LOGIN_SYNC_DEBOUNCE_MS
}

function markWritten(key: string, nowMs: number): void {
  lastWriteByUser.set(key, nowMs)
}

function aliasesForNewRosterEmail(email: string): string[] {
  const alias = shortFormEmailAlias(email)
  return alias ? [alias] : []
}

/**
 * The name for a new Auth0 row: the profile name, or a name built from the
 * address when the profile has none or it holds an email (B53, S18: a name
 * never holds an email address).
 */
function newRosterName(profileName: unknown, email: string): string {
  const name = typeof profileName === "string" ? profileName.trim() : ""
  return name && !name.includes("@") ? name : displayNameFromEmail(email) || email
}

/**
 * The row an Auth0 login or sync inserts for a new address (one place for
 * both writers). The short-form alias is dropped when someone holds it.
 * With `rules` (the `roster_rules` switch) the row goes through the roster
 * rules: it gains its initials alias, and a row that breaks a rule (its
 * address is already someone's alias) is not inserted (null, logged).
 */
export function newRosterRow(
  input: {
    email: string
    name: unknown
    auth0UserId: string | null
    lastLoginAt: string
    rosterSource: Exclude<RosterSource, "manual">
  },
  roster: readonly StoredRosterRow[],
  rules: boolean,
  logTag: string,
): StoredRosterRow | null {
  const holders = roster.map((row) => ({ email: row.email, name: row.name, aliases: row.emailAliases, active: true }))
  const { accepted, refused } = dropCollidingNewAliases(aliasesForNewRosterEmail(input.email), holders, input.email)
  for (const item of refused) {
    console.warn(`${logTag} skipped alias ${item.alias}: already belongs to ${item.holder.name} (${item.holder.email})`)
  }
  let write = { email: input.email, name: newRosterName(input.name, input.email), aliases: accepted }
  if (rules) {
    try {
      write = prepareRosterWrite(write, holders)
    } catch (err) {
      if (!(err instanceof RosterRuleError)) throw err
      console.warn(`${logTag} skipped ${input.email}: ${err.message}`)
      return null
    }
  }
  return {
    email: write.email,
    name: write.name,
    auth0UserId: input.auth0UserId,
    emailAliases: write.aliases,
    roleTitle: null,
    lastLoginAt: input.lastLoginAt,
    rosterSource: input.rosterSource,
  }
}

export async function upsertTeamMemberOnAdminLogin(
  profile: LoginProfile,
  store: RosterLoginStore,
  now: Date = new Date(),
  opts: { rules?: boolean } = {},
): Promise<"created" | "updated" | "debounced" | "skipped"> {
  const email =
    typeof profile.email === "string" ? profile.email.trim().toLowerCase() : ""
  if (!email) return "skipped"

  const key = debounceKey(profile, email)
  const nowMs = now.getTime()
  if (isDebounced(key, nowMs)) return "debounced"

  const lastLoginAt = now.toISOString()
  const auth0UserId =
    typeof profile.sub === "string" && profile.sub.trim()
      ? profile.sub.trim()
      : null
  const existing = await store.findByEmail(email)
  if (!existing) {
    const row = newRosterRow(
      { email, name: profile.name, auth0UserId, lastLoginAt, rosterSource: "auth0_login" },
      await store.listRoster(),
      opts.rules === true,
      "[auth0-roster-login]",
    )
    if (!row) return "skipped"
    await store.insert(row)
    markWritten(key, nowMs)
    return "created"
  }

  const patch: { auth0UserId?: string; lastLoginAt: string } = { lastLoginAt }
  if (existing.auth0UserId == null && auth0UserId) {
    patch.auth0UserId = auth0UserId
  }
  await store.updateOnLogin(email, patch)
  markWritten(key, nowMs)
  return "updated"
}

async function resolveLoginStore(
  store?: RosterLoginStore,
): Promise<RosterLoginStore> {
  if (store) return store
  const { postgresRosterStore } = await import("./auth0RosterStore")
  return postgresRosterStore
}

/**
 * Fail-soft: DB errors must never break Auth0 login.
 * Client sessions never write roster rows.
 */
export async function syncAdminRosterOnLogin(
  user: User | null | undefined,
  store?: RosterLoginStore,
): Promise<void> {
  try {
    if (!user) return
    if (!getUserRoles(user).includes("admin")) return
    const resolved = await resolveLoginStore(store)
    const { rosterRulesOn } = await import("./rosterRead")
    await upsertTeamMemberOnAdminLogin(user, resolved, new Date(), { rules: await rosterRulesOn() })
  } catch (err) {
    console.warn("[auth0-roster-login] fail-soft:", err)
  }
}
