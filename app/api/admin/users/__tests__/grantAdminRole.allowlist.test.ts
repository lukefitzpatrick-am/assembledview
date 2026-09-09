import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../lib/test/mockModuleHarness.js"
import { GOLF_CLIENT_ROWS } from "../../../../../lib/clients/__tests__/golfClientRows.fixture.js"

const skip = mockModuleSkip()

const requireAdminMock = mock.fn(async (_req: unknown) => ({
  session: { user: { email: "admin@example.com" } },
  roles: ["admin"] as const,
  clientSlug: null,
  grantedByAllowlist: false,
}))

const createAuth0UserMock = mock.fn(async () => ({
  user_id: "auth0|new-user",
  email: "new@example.com",
}))
const assignRoleToUserMock = mock.fn(async () => undefined)
const updateAuth0UserMetadataMock = mock.fn(async () => undefined)
const createPasswordChangeTicketMock = mock.fn(async () => "https://ticket.example/set")
const deleteAuth0UserMock = mock.fn(async () => undefined)
const invalidateAuth0UsersListCacheMock = mock.fn(() => undefined)
const sendInviteEmailMock = mock.fn(async () => undefined)
const listAllAuth0UsersMock = mock.fn(async () => ({ users: [], total: 0, page: 0 }))
const readClientsListMock = mock.fn(async () => ({
  status: 200,
  body: [
    { id: 1, slug: "bic", mp_client_name: "BIC" },
    ...GOLF_CLIENT_ROWS,
  ],
  contentType: "application/json",
}))

if (supportsMockModule()) {
  await mock.module!("@/lib/requireRole", {
    namedExports: {
      requireAdmin: requireAdminMock,
    },
  })
  await mock.module!("@/lib/api/auth0Management", {
    namedExports: {
      Auth0HttpError: class Auth0HttpError extends Error {
        status: number
        body: unknown
        constructor(message: string, status: number, body: unknown) {
          super(message)
          this.status = status
          this.body = body
        }
      },
      assignRoleToUser: assignRoleToUserMock,
      createAuth0User: createAuth0UserMock,
      createPasswordChangeTicket: createPasswordChangeTicketMock,
      deleteAuth0User: deleteAuth0UserMock,
      invalidateAuth0UsersListCache: invalidateAuth0UsersListCacheMock,
      listAllAuth0Users: listAllAuth0UsersMock,
      updateAuth0UserMetadata: updateAuth0UserMetadataMock,
    },
  })
  await mock.module!("@/lib/email/inviteSender", {
    namedExports: {
      sendInviteEmail: sendInviteEmailMock,
    },
  })
  await mock.module!("@/lib/data/readClients", {
    namedExports: {
      readClientsList: readClientsListMock,
    },
  })
}

function resetMocks() {
  requireAdminMock.mock.resetCalls()
  requireAdminMock.mock.mockImplementation(async () => ({
    session: { user: { email: "admin@example.com" } },
    roles: ["admin"] as const,
    clientSlug: null,
    grantedByAllowlist: false,
  }))
  createAuth0UserMock.mock.resetCalls()
  assignRoleToUserMock.mock.resetCalls()
  updateAuth0UserMetadataMock.mock.resetCalls()
  createPasswordChangeTicketMock.mock.resetCalls()
  deleteAuth0UserMock.mock.resetCalls()
  invalidateAuth0UsersListCacheMock.mock.resetCalls()
  sendInviteEmailMock.mock.resetCalls()
  readClientsListMock.mock.resetCalls()
  readClientsListMock.mock.mockImplementation(async () => ({
    status: 200,
    body: [
      { id: 1, slug: "bic", mp_client_name: "BIC" },
      ...GOLF_CLIENT_ROWS,
    ],
    contentType: "application/json",
  }))
}

const clientBody = {
  firstName: "Pat",
  lastName: "Client",
  email: "pat.client@example.com",
  password: "TempPass1!",
  role: "client" as const,
  clientSlug: "bic",
}

const adminBody = {
  firstName: "Pat",
  lastName: "Admin",
  email: "pat.admin@example.com",
  password: "TempPass1!",
  role: "admin" as const,
}

test(
  "POST role=admin → 403 when session email not on SUPERADMIN_EMAIL_ALLOWLIST",
  { skip },
  async () => {
    const prevAllow = process.env.SUPERADMIN_EMAIL_ALLOWLIST
    const prevAdminRole = process.env.AUTH0_ROLE_ADMIN_ID
    const prevClientRole = process.env.AUTH0_ROLE_CLIENT_ID
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = "ops@assembled.media"
    process.env.AUTH0_ROLE_ADMIN_ID = "rol_admin"
    process.env.AUTH0_ROLE_CLIENT_ID = "rol_client"
    resetMocks()

    const { POST } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(adminBody),
    })
    const res = await POST(req)
    assert.equal(res.status, 403)
    assert.equal(createAuth0UserMock.mock.calls.length, 0)

    if (prevAllow === undefined) delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    else process.env.SUPERADMIN_EMAIL_ALLOWLIST = prevAllow
    if (prevAdminRole === undefined) delete process.env.AUTH0_ROLE_ADMIN_ID
    else process.env.AUTH0_ROLE_ADMIN_ID = prevAdminRole
    if (prevClientRole === undefined) delete process.env.AUTH0_ROLE_CLIENT_ID
    else process.env.AUTH0_ROLE_CLIENT_ID = prevClientRole
  },
)

test(
  "PUT role=admin → 403 when session email not on SUPERADMIN_EMAIL_ALLOWLIST",
  { skip },
  async () => {
    const prevAllow = process.env.SUPERADMIN_EMAIL_ALLOWLIST
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = "ops@assembled.media"
    resetMocks()

    const { PUT } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...adminBody,
        userId: "auth0|existing",
      }),
    })
    const res = await PUT(req)
    assert.equal(res.status, 403)
    assert.equal(assignRoleToUserMock.mock.calls.length, 0)

    if (prevAllow === undefined) delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    else process.env.SUPERADMIN_EMAIL_ALLOWLIST = prevAllow
  },
)

test(
  "POST role=client still succeeds for a non-allowlisted admin",
  { skip },
  async () => {
    const prevAllow = process.env.SUPERADMIN_EMAIL_ALLOWLIST
    const prevAdminRole = process.env.AUTH0_ROLE_ADMIN_ID
    const prevClientRole = process.env.AUTH0_ROLE_CLIENT_ID
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = "ops@assembled.media"
    process.env.AUTH0_ROLE_ADMIN_ID = "rol_admin"
    process.env.AUTH0_ROLE_CLIENT_ID = "rol_client"
    resetMocks()

    const { POST } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clientBody),
    })
    const res = await POST(req)
    assert.equal(res.status, 201)
    assert.equal(createAuth0UserMock.mock.calls.length, 1)
    assert.equal(assignRoleToUserMock.mock.calls.length, 1)
    const assignArgs = assignRoleToUserMock.mock.calls[0]?.arguments as unknown[]
    assert.equal(assignArgs?.[1], "client")

    if (prevAllow === undefined) delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    else process.env.SUPERADMIN_EMAIL_ALLOWLIST = prevAllow
    if (prevAdminRole === undefined) delete process.env.AUTH0_ROLE_ADMIN_ID
    else process.env.AUTH0_ROLE_ADMIN_ID = prevAdminRole
    if (prevClientRole === undefined) delete process.env.AUTH0_ROLE_CLIENT_ID
    else process.env.AUTH0_ROLE_CLIENT_ID = prevClientRole
  },
)

test(
  "POST clientSlug golf-australia → 201 and app_metadata.client_slug golf-australia",
  { skip },
  async () => {
    const prevAllow = process.env.SUPERADMIN_EMAIL_ALLOWLIST
    const prevAdminRole = process.env.AUTH0_ROLE_ADMIN_ID
    const prevClientRole = process.env.AUTH0_ROLE_CLIENT_ID
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = "ops@assembled.media"
    process.env.AUTH0_ROLE_ADMIN_ID = "rol_admin"
    process.env.AUTH0_ROLE_CLIENT_ID = "rol_client"
    resetMocks()

    const { POST } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...clientBody,
        clientSlug: "golf-australia",
        mbaNumbers: ["GA-001"],
      }),
    })
    const res = await POST(req)
    assert.equal(res.status, 201)
    const createArgs = createAuth0UserMock.mock.calls[0]?.arguments as unknown[]
    const createParams = createArgs?.[0] as { clientSlug?: string; mbaNumbers?: string[] }
    assert.equal(createParams?.clientSlug, "golf-australia")
    assert.deepEqual(createParams?.mbaNumbers, ["ga-001"])
    const metaArgs = updateAuth0UserMetadataMock.mock.calls[0]?.arguments as unknown[]
    const metaParams = metaArgs?.[0] as { app_metadata?: Record<string, unknown> }
    assert.equal(metaParams?.app_metadata?.client_slug, "golf-australia")
    assert.deepEqual(metaParams?.app_metadata?.mba_numbers, ["ga-001"])

    if (prevAllow === undefined) delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    else process.env.SUPERADMIN_EMAIL_ALLOWLIST = prevAllow
    if (prevAdminRole === undefined) delete process.env.AUTH0_ROLE_ADMIN_ID
    else process.env.AUTH0_ROLE_ADMIN_ID = prevAdminRole
    if (prevClientRole === undefined) delete process.env.AUTH0_ROLE_CLIENT_ID
    else process.env.AUTH0_ROLE_CLIENT_ID = prevClientRole
  },
)

test(
  "POST clientSlug golf → 400 unknown client slug (mbaidentifier is not a slug)",
  { skip },
  async () => {
    const prevAllow = process.env.SUPERADMIN_EMAIL_ALLOWLIST
    const prevAdminRole = process.env.AUTH0_ROLE_ADMIN_ID
    const prevClientRole = process.env.AUTH0_ROLE_CLIENT_ID
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = "ops@assembled.media"
    process.env.AUTH0_ROLE_ADMIN_ID = "rol_admin"
    process.env.AUTH0_ROLE_CLIENT_ID = "rol_client"
    resetMocks()

    const { POST } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...clientBody,
        clientSlug: "golf",
      }),
    })
    const res = await POST(req)
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error?: string }
    assert.equal(body.error, "unknown client slug")
    assert.equal(createAuth0UserMock.mock.calls.length, 0)

    if (prevAllow === undefined) delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    else process.env.SUPERADMIN_EMAIL_ALLOWLIST = prevAllow
    if (prevAdminRole === undefined) delete process.env.AUTH0_ROLE_ADMIN_ID
    else process.env.AUTH0_ROLE_ADMIN_ID = prevAdminRole
    if (prevClientRole === undefined) delete process.env.AUTH0_ROLE_CLIENT_ID
    else process.env.AUTH0_ROLE_CLIENT_ID = prevClientRole
  },
)

test(
  "PUT promote to admin sends explicit null for client_slug, client_slugs, mba_numbers, primary_mba_number",
  { skip },
  async () => {
    const prevAllow = process.env.SUPERADMIN_EMAIL_ALLOWLIST
    process.env.SUPERADMIN_EMAIL_ALLOWLIST = "admin@example.com"
    resetMocks()

    const { PUT } = await import("../route.js")
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...adminBody,
        userId: "auth0|existing",
      }),
    })
    const res = await PUT(req)
    assert.equal(res.status, 200)
    assert.equal(assignRoleToUserMock.mock.calls.length, 1)
    const metaArgs = updateAuth0UserMetadataMock.mock.calls[0]?.arguments as unknown[]
    const metaParams = metaArgs?.[0] as { app_metadata?: Record<string, unknown> }
    assert.equal(metaParams?.app_metadata?.role, "admin")
    assert.equal(metaParams?.app_metadata?.client_slug, null)
    assert.equal(metaParams?.app_metadata?.client_slugs, null)
    assert.equal(metaParams?.app_metadata?.mba_numbers, null)
    assert.equal(metaParams?.app_metadata?.primary_mba_number, null)

    if (prevAllow === undefined) delete process.env.SUPERADMIN_EMAIL_ALLOWLIST
    else process.env.SUPERADMIN_EMAIL_ALLOWLIST = prevAllow
  },
)

