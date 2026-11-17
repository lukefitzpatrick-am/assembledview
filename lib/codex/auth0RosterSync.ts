import {
  isAuth0ManagementClientConfigured,
  listAllAuth0UsersUnpaged,
  type Auth0ListedUser,
} from "@/lib/api/auth0Management"

import { newRosterRow, type StoredRosterRow } from "./auth0LoginUpsert"
import {
  listedUserRoles,
  rosterEligibilityForManagementUser,
} from "./rosterEligibility"

export type Auth0RosterSyncStatus = "ok" | "not_configured" | "error"

export type Auth0RosterSyncResult = {
  status: Auth0RosterSyncStatus
  seen: number
  created: number
  updated: number
  skipped: number
  missingInAuth0: number
  noResolvableRole: number
  treatedAsAdminByDomainRule: number
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
  /** The `roster_rules` switch (B53). Left out: off. */
  rulesOn?: () => Promise<boolean>
}

const EMPTY_COUNTS = {
  seen: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  missingInAuth0: 0,
  noResolvableRole: 0,
  treatedAsAdminByDomainRule: 0,
} as const

async function defaultDeps(): Promise<Auth0RosterSyncDeps> {
  const { postgresRosterStore } = await import("./auth0RosterStore")
  const { rosterRulesOn } = await import("./rosterRead")
  return {
    isConfigured: isAuth0ManagementClientConfigured,
    listUsers: () => listAllAuth0UsersUnpaged(),
    store: postgresRosterStore,
    rulesOn: rosterRulesOn,
  }
}

async function upsertAdminFromAuth0(
  user: Auth0ListedUser,
  store: RosterSyncStore,
  nowIso: string,
  rules: boolean,
): Promise<"created" | "updated" | "skipped"> {
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : ""
  if (!email) return "skipped"

  const lastLoginAt =
    typeof user.last_login === "string" && user.last_login.trim()
      ? user.last_login.trim()
      : nowIso
  const auth0UserId = user.user_id?.trim() || null
  const existing = await store.findByEmail(email)
  if (!existing) {
    const row = newRosterRow(
      { email, name: user.name, auth0UserId, lastLoginAt, rosterSource: "auth0_sync" },
      await store.listRoster(),
      rules,
      "[auth0-roster-sync]",
    )
    if (!row) return "skipped"
    await store.insert(row)
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
  const rules = (await deps.rulesOn?.()) === true
  let created = 0
  let updated = 0
  let skipped = 0
  let noResolvableRole = 0
  let treatedAsAdminByDomainRule = 0
  const presentAdminEmails = new Set<string>()

  for (const user of users) {
    const roles = listedUserRoles(user.app_metadata)
    if (roles.length === 0) noResolvableRole += 1
    const email =
      typeof user.email === "string" ? user.email.trim().toLowerCase() : ""
    const eligibility = rosterEligibilityForManagementUser({
      email,
      app_metadata: user.app_metadata,
    })
    if (!eligibility.eligible) {
      skipped += 1
      console.warn(
        `[auth0-roster-sync] skipped ${email || "(no email)"}: ${eligibility.reason}`,
      )
      continue
    }
    if (user.blocked || !email) {
      skipped += 1
      continue
    }
    if (eligibility.via === "domain_rule") {
      treatedAsAdminByDomainRule += 1
    }
    presentAdminEmails.add(email)
    try {
      const outcome = await upsertAdminFromAuth0(user, deps.store, nowIso, rules)
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
    treatedAsAdminByDomainRule,
  }
}
