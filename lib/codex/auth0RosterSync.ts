import type { User } from "@auth0/nextjs-auth0/types"

import {
  isAuth0ManagementClientConfigured,
  listAllAuth0UsersUnpaged,
  type Auth0ListedUser,
} from "@/lib/api/auth0Management"
import { getUserRoles } from "@/lib/rbac"

import {
  aliasesForNewRosterEmail,
  type StoredRosterRow,
} from "./auth0LoginUpsert"

export type Auth0RosterSyncStatus = "ok" | "not_configured" | "error"

export type Auth0RosterSyncResult = {
  status: Auth0RosterSyncStatus
  seen: number
  created: number
  updated: number
  skipped: number
  missingInAuth0: number
  noResolvableRole: number
  message?: string
}

export type RosterSyncStore = {
  listRoster(): Promise<StoredRosterRow[]>
  findByEmail(email: string): Promise<StoredRosterRow | null>
  insert(row: StoredRosterRow): Promise<void>
  updateOnSync(
    email: string,
    patch: { auth0UserId?: string; lastLoginAt?: string },
  ): Promise<void>
}

export type Auth0RosterSyncDeps = {
  isConfigured: () => boolean
  listUsers: () => Promise<Auth0ListedUser[]>
  store: RosterSyncStore
}

const EMPTY_COUNTS = {
  seen: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  missingInAuth0: 0,
  noResolvableRole: 0,
} as const

function listedUserRoles(user: Auth0ListedUser) {
  return getUserRoles({ app_metadata: user.app_metadata } as unknown as User)
}

async function defaultDeps(): Promise<Auth0RosterSyncDeps> {
  const { postgresRosterStore } = await import("./auth0RosterStore")
  return {
    isConfigured: isAuth0ManagementClientConfigured,
    listUsers: () => listAllAuth0UsersUnpaged(),
    store: postgresRosterStore,
  }
}

async function upsertAdminFromAuth0(
  user: Auth0ListedUser,
  store: RosterSyncStore,
  nowIso: string,
): Promise<"created" | "updated" | "skipped"> {
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : ""
  if (!email) return "skipped"

  const lastLoginAt =
    typeof user.last_login === "string" && user.last_login.trim()
      ? user.last_login.trim()
      : nowIso
  const auth0UserId = user.user_id?.trim() || null
  const name =
    typeof user.name === "string" && user.name.trim() ? user.name.trim() : email

  const existing = await store.findByEmail(email)
  if (!existing) {
    await store.insert({
      email,
      name,
      auth0UserId,
      emailAliases: aliasesForNewRosterEmail(email),
      roleTitle: null,
      lastLoginAt,
      rosterSource: "auth0_sync",
    })
    return "created"
  }

  const patch: { auth0UserId?: string; lastLoginAt?: string } = { lastLoginAt }
  if (existing.auth0UserId == null && auth0UserId) {
    patch.auth0UserId = auth0UserId
  }
  await store.updateOnSync(email, patch)
  return "updated"
}

export async function runAuth0RosterSync(
  injected?: Auth0RosterSyncDeps,
): Promise<Auth0RosterSyncResult> {
  const deps = injected ?? (await defaultDeps())
  if (!deps.isConfigured()) {
    return {
      status: "not_configured",
      ...EMPTY_COUNTS,
      message:
        "Auth0 Management API is not configured (AUTH0_MGMT_CLIENT_ID / AUTH0_MGMT_CLIENT_SECRET).",
    }
  }

  let users: Auth0ListedUser[]
  try {
    users = await deps.listUsers()
  } catch (err) {
    return {
      status: "error",
      ...EMPTY_COUNTS,
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const nowIso = new Date().toISOString()
  let created = 0
  let updated = 0
  let skipped = 0
  let noResolvableRole = 0
  const presentAdminEmails = new Set<string>()

  for (const user of users) {
    const roles = listedUserRoles(user)
    if (roles.length === 0) noResolvableRole += 1
    const email =
      typeof user.email === "string" ? user.email.trim().toLowerCase() : ""
    const isAdmin = roles.includes("admin")
    if (!isAdmin || user.blocked || !email) {
      skipped += 1
      continue
    }
    presentAdminEmails.add(email)
    try {
      const outcome = await upsertAdminFromAuth0(user, deps.store, nowIso)
      if (outcome === "created") created += 1
      else if (outcome === "updated") updated += 1
      else skipped += 1
    } catch (err) {
      console.warn("[auth0-roster-sync] upsert skipped:", err)
      skipped += 1
    }
  }

  const roster = await deps.store.listRoster()
  let missingInAuth0 = 0
  for (const row of roster) {
    const email = row.email.trim().toLowerCase()
    if (!email) continue
    if (!presentAdminEmails.has(email)) missingInAuth0 += 1
  }

  return {
    status: "ok",
    seen: users.length,
    created,
    updated,
    skipped,
    missingInAuth0,
    noResolvableRole,
  }
}
