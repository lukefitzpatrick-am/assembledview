import type { User } from "@auth0/nextjs-auth0/types"

import { getUserRoles } from "@/lib/rbac"

import { shortFormEmailAlias } from "./rosterEmailAlias"

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

export function aliasesForNewRosterEmail(email: string): string[] {
  const alias = shortFormEmailAlias(email)
  return alias ? [alias] : []
}

export async function upsertTeamMemberOnAdminLogin(
  profile: LoginProfile,
  store: RosterLoginStore,
  now: Date = new Date(),
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
  const name =
    typeof profile.name === "string" && profile.name.trim()
      ? profile.name.trim()
      : email

  const existing = await store.findByEmail(email)
  if (!existing) {
    await store.insert({
      email,
      name,
      auth0UserId,
      emailAliases: aliasesForNewRosterEmail(email),
      roleTitle: null,
      lastLoginAt,
      rosterSource: "auth0_login",
    })
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
    await upsertTeamMemberOnAdminLogin(user, resolved)
  } catch (err) {
    console.warn("[auth0-roster-login] fail-soft:", err)
  }
}
