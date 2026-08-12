import assert from "node:assert/strict"
import test from "node:test"
import {
  createGraphClient,
  M365ProvisioningDisabledError,
  parseRetryAfterMs,
} from "../graphClient"
import type { GraphTransport, GraphTransportResponse } from "../graphTransport"
import { createMemoryProvisioningLogWriter } from "../provisioningLog"

const CREDS = {
  tenantId: "tenant-1",
  clientId: "client-1",
  clientSecret: "secret-1",
}

function tokenOk() {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    bodyText: JSON.stringify({ access_token: "tok-1", expires_in: 3600 }),
  }
}

test("parseRetryAfterMs honours Retry-After seconds", () => {
  assert.equal(parseRetryAfterMs("7", 0, 0, () => 0.5), 7000)
})

test("parseRetryAfterMs falls back to exponential backoff + jitter", () => {
  // attempt 0, base 250, random 0.5 → jitter 1.0 → 250
  assert.equal(parseRetryAfterMs(undefined, 0, 0, () => 0.5), 250)
  // attempt 2, base 1000, random 0 → jitter 0.5 → 500
  assert.equal(parseRetryAfterMs(undefined, 2, 0, () => 0), 500)
})

test("flag-off refuses before any Graph call", async () => {
  const { write, sink } = createMemoryProvisioningLogWriter()
  let transportCalls = 0
  const transport: GraphTransport = async () => {
    transportCalls += 1
    return tokenOk()
  }
  const client = createGraphClient({
    transport,
    writeLog: write,
    credentials: CREDS,
    isEnabled: () => false,
    sleep: async () => {},
  })

  await assert.rejects(
    () =>
      client.createTeam({ displayName: "Penfolds" }),
    (err: unknown) => err instanceof M365ProvisioningDisabledError
  )
  assert.equal(transportCalls, 0)
  assert.equal(sink.length, 1)
  assert.equal(sink[0]?.outcome, "failure")
  assert.equal(sink[0]?.error, "provisioning disabled")
  assert.equal(sink[0]?.action, "create_team")
})

test("token is cached across Graph calls (single token POST)", async () => {
  const { write, sink } = createMemoryProvisioningLogWriter()
  const calls: string[] = []
  let now = 1_000_000
  const transport: GraphTransport = async (req) => {
    calls.push(`${req.method} ${req.url}`)
    if (req.url.includes("/oauth2/v2.0/token")) return tokenOk()
    if (req.url.includes("/teams/") && req.url.includes("/channels")) {
      return {
        status: 201,
        headers: {},
        bodyText: JSON.stringify({ id: "ch-1", displayName: "General" }),
      }
    }
    return {
      status: 201,
      headers: {},
      bodyText: JSON.stringify({ id: "team-1", displayName: "T" }),
    }
  }
  const client = createGraphClient({
    transport,
    writeLog: write,
    credentials: CREDS,
    isEnabled: () => true,
    now: () => now,
    sleep: async () => {},
  })

  await client.createTeam({ displayName: "A" })
  await client.createChannel({ teamId: "team-1", displayName: "General" })
  const tokenPosts = calls.filter((c) => c.includes("/oauth2/v2.0/token"))
  assert.equal(tokenPosts.length, 1)
  assert.ok(sink.some((r) => r.action === "create_team" && r.outcome === "success"))
  assert.ok(
    sink.some((r) => r.action === "create_channel" && r.outcome === "success")
  )

  // Advance past expiry skew → next call refreshes
  now += 3_600_000
  await client.createTeam({ displayName: "B" })
  assert.equal(
    calls.filter((c) => c.includes("/oauth2/v2.0/token")).length,
    2
  )
})

test("429 retry honours Retry-After and logs each attempt", async () => {
  const { write, sink } = createMemoryProvisioningLogWriter()
  const sleeps: number[] = []
  let teamAttempts = 0
  const transport: GraphTransport = async (req): Promise<GraphTransportResponse> => {
    if (req.url.includes("/oauth2/v2.0/token")) return tokenOk()
    if (req.method === "POST" && req.url.endsWith("/teams")) {
      teamAttempts += 1
      if (teamAttempts === 1) {
        return {
          status: 429,
          headers: { "retry-after": "2" },
          bodyText: '{"error":"throttled"}',
        }
      }
      return {
        status: 201,
        headers: {},
        bodyText: JSON.stringify({ id: "team-ok" }),
      }
    }
    return { status: 500, headers: {}, bodyText: "unexpected" }
  }
  const client = createGraphClient({
    transport,
    writeLog: write,
    credentials: CREDS,
    isEnabled: () => true,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => 0.5,
  })

  const team = await client.createTeam({ displayName: "Retry Me" })
  assert.equal(team.id, "team-ok")
  assert.deepEqual(sleeps, [2000])
  const teamLogs = sink.filter((r) => r.action === "create_team")
  assert.equal(teamLogs.length, 2)
  assert.equal(teamLogs[0]?.outcome, "failure")
  assert.equal(teamLogs[0]?.error, "HTTP 429")
  assert.equal(teamLogs[1]?.outcome, "success")
})

test("ensureSite is check-then-create; re-run is a no-op", async () => {
  const { write, sink } = createMemoryProvisioningLogWriter()
  let siteExists = false
  let createCount = 0
  const transport: GraphTransport = async (req) => {
    if (req.url.includes("/oauth2/v2.0/token")) return tokenOk()
    if (req.method === "GET" && req.url.includes("/sites/")) {
      if (!siteExists) {
        return { status: 404, headers: {}, bodyText: "" }
      }
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          id: "site-1",
          displayName: "Penfolds",
          webUrl: "https://contoso.sharepoint.com/sites/cli-penfold",
        }),
      }
    }
    if (req.method === "POST" && req.url.endsWith("/sites")) {
      createCount += 1
      siteExists = true
      return {
        status: 201,
        headers: {},
        bodyText: JSON.stringify({
          id: "site-1",
          displayName: "Penfolds",
        }),
      }
    }
    return { status: 500, headers: {}, bodyText: "unexpected" }
  }
  const client = createGraphClient({
    transport,
    writeLog: write,
    credentials: CREDS,
    isEnabled: () => true,
    sleep: async () => {},
  })

  const first = await client.ensureSite({
    siteUrl: "/sites/cli-penfold",
    displayName: "Penfolds",
    hostname: "contoso.sharepoint.com",
    serverRelativePath: "sites/cli-penfold",
  })
  assert.equal(first.id, "site-1")
  assert.equal(createCount, 1)

  const second = await client.ensureSite({
    siteUrl: "/sites/cli-penfold",
    displayName: "Penfolds",
    hostname: "contoso.sharepoint.com",
    serverRelativePath: "sites/cli-penfold",
  })
  assert.equal(second.id, "site-1")
  assert.equal(createCount, 1)
  assert.ok(sink.some((r) => r.action === "ensure_site" && r.outcome === "skipped"))
})

test("ensureFolderPath is check-then-create; re-run is a no-op", async () => {
  const { write } = createMemoryProvisioningLogWriter()
  const folders = new Set<string>()
  let createPosts = 0
  const transport: GraphTransport = async (req) => {
    if (req.url.includes("/oauth2/v2.0/token")) return tokenOk()
    const folderMatch = req.url.match(/\/drives\/drive-1\/root:\/([^:?]+)/)
    const key = folderMatch ? decodeURIComponent(folderMatch[1]!) : ""
    if (req.method === "GET" && folderMatch) {
      if (!folders.has(key)) {
        return { status: 404, headers: {}, bodyText: "" }
      }
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify({ id: `id-${key}`, name: key, folder: {} }),
      }
    }
    if (req.method === "POST" && req.url.includes("/children")) {
      createPosts += 1
      const body = JSON.parse(String(req.body ?? "{}")) as { name?: string }
      const parentMatch = req.url.match(/\/root:\/([^:]+):\/children/)
      const parent = parentMatch ? decodeURIComponent(parentMatch[1]!) : ""
      const full = parent ? `${parent}/${body.name}` : String(body.name ?? "")
      folders.add(full)
      return {
        status: 201,
        headers: {},
        bodyText: JSON.stringify({ id: `id-${full}`, name: body.name, folder: {} }),
      }
    }
    return { status: 500, headers: {}, bodyText: `unexpected ${req.method} ${req.url}` }
  }
  const client = createGraphClient({
    transport,
    writeLog: write,
    credentials: CREDS,
    isEnabled: () => true,
    sleep: async () => {},
  })

  const first = await client.ensureFolderPath({
    driveId: "drive-1",
    path: "Campaigns/PENFOLD001",
  })
  assert.equal(first.id, "id-Campaigns/PENFOLD001")
  assert.equal(createPosts, 2)

  const second = await client.ensureFolderPath({
    driveId: "drive-1",
    path: "Campaigns/PENFOLD001",
  })
  assert.equal(second.id, "id-Campaigns/PENFOLD001")
  assert.equal(createPosts, 2)
})

test("log row written per attempt including terminal failure", async () => {
  const { write, sink } = createMemoryProvisioningLogWriter()
  const transport: GraphTransport = async (req) => {
    if (req.url.includes("/oauth2/v2.0/token")) return tokenOk()
    return { status: 400, headers: {}, bodyText: "bad" }
  }
  const client = createGraphClient({
    transport,
    writeLog: write,
    credentials: CREDS,
    isEnabled: () => true,
    sleep: async () => {},
    maxRetries: 0,
  })

  await assert.rejects(() => client.postChannelMessage({
    teamId: "t1",
    channelId: "c1",
    text: "hello",
  }))
  const rows = sink.filter((r) => r.action === "post_channel_message")
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.outcome, "failure")
  assert.equal(rows[0]?.error, "HTTP 400")
})
