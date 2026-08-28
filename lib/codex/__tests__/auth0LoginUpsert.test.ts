import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { User } from "@auth0/nextjs-auth0/types"

import {
  LOGIN_SYNC_DEBOUNCE_MS,
  resetLoginSyncDebounceForTests,
  syncAdminRosterOnLogin,
  upsertTeamMemberOnAdminLogin,
  type RosterLoginStore,
  type StoredRosterRow,
} from "../auth0LoginUpsert.js"

const ROLE_CLAIM = "https://assembledview.com/roles"

function adminUser(overrides: Partial<User> = {}): User {
  return {
    email: "luke.fitzpatrick@assembledmedia.com.au",
    name: "Luke Fitzpatrick",
    sub: "auth0|luke",
    [ROLE_CLAIM]: ["admin"],
    ...overrides,
  } as User
}

function clientUser(): User {
  return {
    email: "client@example.com",
    name: "Client Person",
    sub: "auth0|client",
    [ROLE_CLAIM]: ["client"],
  } as User
}

function memoryStore(seed: StoredRosterRow[] = []): RosterLoginStore & {
  rows: Map<string, StoredRosterRow>
  inserts: StoredRosterRow[]
  updates: Array<{ email: string; patch: { auth0UserId?: string; lastLoginAt: string } }>
} {
  const rows = new Map(seed.map((r) => [r.email, { ...r }]))
  const inserts: StoredRosterRow[] = []
  const updates: Array<{
    email: string
    patch: { auth0UserId?: string; lastLoginAt: string }
  }> = []
  return {
    rows,
    inserts,
    updates,
    async findByEmail(email) {
      return rows.get(email) ?? null
    },
    async listRoster() {
      return [...rows.values()].map((r) => ({ ...r }))
    },
    async insert(row) {
      const stored = { ...row }
      rows.set(row.email, stored)
      inserts.push(stored)
    },
    async updateOnLogin(email, patch) {
      updates.push({ email, patch })
      const existing = rows.get(email)
      if (!existing) return
      if (patch.auth0UserId !== undefined && existing.auth0UserId == null) {
        existing.auth0UserId = patch.auth0UserId
      }
      existing.lastLoginAt = patch.lastLoginAt
    },
  }
}

describe("upsertTeamMemberOnAdminLogin", () => {
  afterEach(() => {
    resetLoginSyncDebounceForTests()
  })

  it("creates once then debounces a second write within the hour", async () => {
    const store = memoryStore()
    const t0 = new Date("2026-08-13T10:00:00.000Z")
    const created = await upsertTeamMemberOnAdminLogin(
      {
        email: "luke.fitzpatrick@assembledmedia.com.au",
        name: "Luke Fitzpatrick",
        sub: "auth0|luke",
      },
      store,
      t0,
    )
    assert.equal(created, "created")
    assert.equal(store.inserts.length, 1)
    assert.equal(store.inserts[0]!.rosterSource, "auth0_login")
    assert.equal(store.inserts[0]!.auth0UserId, "auth0|luke")
    assert.deepEqual(store.inserts[0]!.emailAliases, [
      "luke@assembledmedia.com.au",
    ])

    const again = await upsertTeamMemberOnAdminLogin(
      {
        email: "luke.fitzpatrick@assembledmedia.com.au",
        name: "Luke Fitzpatrick",
        sub: "auth0|luke",
      },
      store,
      new Date(t0.getTime() + LOGIN_SYNC_DEBOUNCE_MS - 1),
    )
    assert.equal(again, "debounced")
    assert.equal(store.inserts.length, 1)
    assert.equal(store.updates.length, 0)
  })

  it("does not overwrite a human-edited name on an existing row", async () => {
    const store = memoryStore([
      {
        email: "chelsea.schultz@assembledmedia.com.au",
        name: "Chelsea (edited)",
        auth0UserId: null,
        emailAliases: ["chelsea@assembledmedia.com.au"],
        roleTitle: "AM",
        lastLoginAt: null,
        rosterSource: "manual",
      },
    ])
    const result = await upsertTeamMemberOnAdminLogin(
      {
        email: "chelsea.schultz@assembledmedia.com.au",
        name: "Chelsea Schultz",
        sub: "auth0|chelsea",
      },
      store,
      new Date("2026-08-13T11:00:00.000Z"),
    )
    assert.equal(result, "updated")
    const row = store.rows.get("chelsea.schultz@assembledmedia.com.au")!
    assert.equal(row.name, "Chelsea (edited)")
    assert.equal(row.roleTitle, "AM")
    assert.deepEqual(row.emailAliases, ["chelsea@assembledmedia.com.au"])
    assert.equal(row.auth0UserId, "auth0|chelsea")
    assert.equal(row.lastLoginAt, "2026-08-13T11:00:00.000Z")
    assert.equal(store.updates[0]!.patch.auth0UserId, "auth0|chelsea")
  })

  it("does not overwrite auth0_user_id once set", async () => {
    const store = memoryStore([
      {
        email: "jenny.lee@assembledmedia.com.au",
        name: "Jenny Lee",
        auth0UserId: "auth0|original",
        emailAliases: [],
        roleTitle: null,
        lastLoginAt: null,
        rosterSource: "manual",
      },
    ])
    await upsertTeamMemberOnAdminLogin(
      {
        email: "jenny.lee@assembledmedia.com.au",
        name: "Jenny Lee",
        sub: "auth0|new-sub",
      },
      store,
      new Date("2026-08-13T12:00:00.000Z"),
    )
    const row = store.rows.get("jenny.lee@assembledmedia.com.au")!
    assert.equal(row.auth0UserId, "auth0|original")
    assert.equal(store.updates[0]!.patch.auth0UserId, undefined)
  })

  it("does not save a generated first-name alias that another active row already holds", async () => {
    const store = memoryStore([
      {
        email: "samantha.keah@assembledmedia.com.au",
        name: "Samantha Keah",
        auth0UserId: "auth0|keah",
        emailAliases: ["samantha@assembledmedia.com.au"],
        roleTitle: null,
        lastLoginAt: null,
        rosterSource: "auth0_sync",
      },
    ])
    const created = await upsertTeamMemberOnAdminLogin(
      {
        email: "samantha.murphy@assembledmedia.com.au",
        name: "Samantha Murphy",
        sub: "auth0|murphy",
      },
      store,
      new Date("2026-08-13T13:00:00.000Z"),
    )
    assert.equal(created, "created")
    assert.deepEqual(store.inserts[0]!.emailAliases, [])
  })
})

describe("syncAdminRosterOnLogin", () => {
  afterEach(() => {
    resetLoginSyncDebounceForTests()
  })

  it("never writes roster rows for client logins", async () => {
    const store = memoryStore()
    await syncAdminRosterOnLogin(clientUser(), store)
    assert.equal(store.inserts.length, 0)
    assert.equal(store.updates.length, 0)
  })

  it("upserts an admin login", async () => {
    const store = memoryStore()
    await syncAdminRosterOnLogin(adminUser(), store)
    assert.equal(store.inserts.length, 1)
    assert.equal(store.inserts[0]!.email, "luke.fitzpatrick@assembledmedia.com.au")
  })

  it("swallows store errors so login cannot fail", async () => {
    const store = memoryStore()
    store.findByEmail = async () => {
      throw new Error("db down")
    }
    await assert.doesNotReject(() => syncAdminRosterOnLogin(adminUser(), store))
  })
})
