import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { Auth0ListedUser } from "@/lib/api/auth0Management"

import {
  runAuth0RosterSync,
  type Auth0RosterSyncDeps,
  type RosterSyncStore,
} from "../auth0RosterSync.js"
import type { StoredRosterRow } from "../auth0LoginUpsert.js"

function memorySyncStore(seed: StoredRosterRow[] = []): RosterSyncStore & {
  rows: Map<string, StoredRosterRow>
  deletes: number
  deactivates: number
  delete: () => Promise<void>
  deactivate: () => Promise<void>
} {
  const rows = new Map(seed.map((r) => [r.email, { ...r }]))
  return {
    rows,
    deletes: 0,
    deactivates: 0,
    async listRoster() {
      return [...rows.values()].map((r) => ({
        email: r.email,
        active: true,
        name: r.name,
        auth0UserId: r.auth0UserId,
        emailAliases: r.emailAliases,
        roleTitle: r.roleTitle,
        lastLoginAt: r.lastLoginAt,
        rosterSource: r.rosterSource,
      }))
    },
    async findByEmail(email) {
      return rows.get(email) ?? null
    },
    async insert(row) {
      rows.set(row.email, { ...row })
    },
    async updateOnSync(email, patch) {
      const existing = rows.get(email)
      if (!existing) return
      if (patch.auth0UserId !== undefined && existing.auth0UserId == null) {
        existing.auth0UserId = patch.auth0UserId
      }
      if (patch.lastLoginAt !== undefined) existing.lastLoginAt = patch.lastLoginAt
    },
    async delete() {
      this.deletes += 1
    },
    async deactivate() {
      this.deactivates += 1
    },
  }
}

function deps(partial: Partial<Auth0RosterSyncDeps> & { store: RosterSyncStore }): Auth0RosterSyncDeps {
  return {
    isConfigured: () => true,
    listUsers: async () => [],
    ...partial,
  }
}

describe("runAuth0RosterSync", () => {
  it("returns not-configured without listing or writing when mgmt credentials are absent", async () => {
    const store = memorySyncStore()
    let listed = 0
    const result = await runAuth0RosterSync(
      deps({
        store,
        isConfigured: () => false,
        listUsers: async () => {
          listed += 1
          return []
        },
      }),
    )
    assert.equal(result.status, "not_configured")
    assert.equal(listed, 0)
    assert.equal(store.rows.size, 0)
    assert.match(result.message ?? "", /not configured/i)
  })

  it("creates an admin, skips clients, and never deletes or deactivates", async () => {
    const store = memorySyncStore()
    const users: Auth0ListedUser[] = [
      {
        user_id: "auth0|luke",
        email: "luke.fitzpatrick@assembledmedia.com.au",
        name: "Luke Fitzpatrick",
        last_login: "2026-08-13T01:00:00.000Z",
        app_metadata: { role: "admin" },
      },
      {
        user_id: "auth0|client",
        email: "client@acme.com",
        name: "Client",
        app_metadata: { role: "client" },
      },
    ]
    const result = await runAuth0RosterSync(
      deps({
        store,
        listUsers: async () => users,
      }),
    )
    assert.equal(result.status, "ok")
    assert.equal(result.seen, 2)
    assert.equal(result.created, 1)
    assert.equal(result.updated, 0)
    assert.equal(result.skipped, 1)
    assert.equal(store.rows.size, 1)
    assert.equal(store.deletes, 0)
    assert.equal(store.deactivates, 0)
    const created = store.rows.get("luke.fitzpatrick@assembledmedia.com.au")!
    assert.equal(created.rosterSource, "auth0_sync")
    assert.deepEqual(created.emailAliases, ["luke@assembledmedia.com.au"])
  })

  it("does not overwrite a human-edited name on sync", async () => {
    const store = memorySyncStore([
      {
        email: "samantha.jones@assembledmedia.com.au",
        name: "Sam (human)",
        auth0UserId: null,
        emailAliases: ["keep-me@assembledmedia.com.au"],
        roleTitle: "Strategy",
        lastLoginAt: null,
        rosterSource: "manual",
      },
    ])
    const result = await runAuth0RosterSync(
      deps({
        store,
        listUsers: async () => [
          {
            user_id: "auth0|sam",
            email: "samantha.jones@assembledmedia.com.au",
            name: "Samantha Jones",
            last_login: "2026-08-13T02:00:00.000Z",
            app_metadata: { role: "admin" },
          },
        ],
      }),
    )
    assert.equal(result.status, "ok")
    assert.equal(result.updated, 1)
    const row = store.rows.get("samantha.jones@assembledmedia.com.au")!
    assert.equal(row.name, "Sam (human)")
    assert.deepEqual(row.emailAliases, ["keep-me@assembledmedia.com.au"])
    assert.equal(row.roleTitle, "Strategy")
    assert.equal(row.auth0UserId, "auth0|sam")
  })

  it("reports missing-in-Auth0 without deactivating the roster row", async () => {
    const store = memorySyncStore([
      {
        email: "gone@assembledmedia.com.au",
        name: "Gone",
        auth0UserId: "auth0|gone",
        emailAliases: [],
        roleTitle: null,
        lastLoginAt: null,
        rosterSource: "manual",
      },
    ])
    const result = await runAuth0RosterSync(
      deps({
        store,
        listUsers: async () => [
          {
            user_id: "auth0|blocked",
            email: "blocked@assembledmedia.com.au",
            name: "Blocked",
            blocked: true,
            app_metadata: { role: "admin" },
          },
        ],
      }),
    )
    assert.equal(result.status, "ok")
    assert.equal(result.missingInAuth0, 1)
    assert.equal(store.rows.get("gone@assembledmedia.com.au")!.name, "Gone")
    assert.equal(store.deletes, 0)
    assert.equal(store.deactivates, 0)
  })

  it("counts Auth0 users with no resolvable app_metadata role", async () => {
    const store = memorySyncStore()
    const result = await runAuth0RosterSync(
      deps({
        store,
        listUsers: async () => [
          {
            user_id: "auth0|claim-only",
            email: "claim.only@assembledmedia.com.au",
            name: "Claim Only",
          },
        ],
      }),
    )
    assert.equal(result.status, "ok")
    assert.equal(result.noResolvableRole, 1)
    assert.equal(result.created, 0)
    assert.equal(store.rows.size, 0)
  })
})
