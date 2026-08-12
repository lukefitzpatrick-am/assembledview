import assert from "node:assert/strict"
import { test } from "node:test"

import { MyHoursClient } from "../client.js"
import { ensureClientCampaignStructure } from "../ensureOneStructure.js"
import type { StructureLink } from "../sync.js"

function createClient(
  handler: (url: string, method: string) => Response | Promise<Response>
): MyHoursClient {
  return new MyHoursClient({
    getApiKey: () => "test-key",
    transport: async (input, init) =>
      handler(String(input), (init?.method ?? "GET").toUpperCase()),
  })
}

test("missing links create and save one client project and campaign task", async () => {
  const links: StructureLink[] = []
  const requests: string[] = []
  const client = createClient((url, method) => {
    requests.push(`${method} ${url}`)
    if (method === "GET" && url.endsWith("/Projects/getAll")) {
      return Response.json([])
    }
    if (method === "POST" && url.endsWith("/Projects")) {
      return Response.json({ id: 101, name: "Acme" }, { status: 201 })
    }
    if (method === "GET" && url.endsWith("/Projects/101/tasklist")) {
      return Response.json([])
    }
    if (method === "POST" && url.endsWith("/Projects/101/task")) {
      return Response.json(
        { id: 202, name: "foo001 — Brand push" },
        { status: 201 }
      )
    }
    return new Response("not found", { status: 404 })
  })

  const result = await ensureClientCampaignStructure({
    clientId: 7,
    clientName: " Acme ",
    mbaNumber: " FOO001 ",
    campaignName: " Brand push ",
    client,
    loadLinks: async () => links.map((link) => ({ ...link })),
    saveLink: async (link) => {
      links.push({ ...link })
    },
  })

  assert.deepEqual(result, { ok: true, projectId: "101", taskId: "202" })
  assert.deepEqual(links, [
    {
      kind: "client_project",
      clientId: 7,
      mbaNumber: null,
      myhoursId: "101",
      myhoursName: "Acme",
    },
    {
      kind: "campaign_task",
      clientId: 7,
      mbaNumber: "foo001",
      myhoursId: "202",
      myhoursName: "foo001 — Brand push",
    },
  ])
  assert.equal(requests.filter((request) => request.startsWith("POST")).length, 2)
})

test("a second ensure uses saved links without creating structure again", async () => {
  const links: StructureLink[] = []
  let requestCount = 0
  const client = createClient((url, method) => {
    requestCount += 1
    if (method === "GET" && url.endsWith("/Projects/getAll")) {
      return Response.json([])
    }
    if (method === "POST" && url.endsWith("/Projects")) {
      return Response.json({ id: 101, name: "Acme" }, { status: 201 })
    }
    if (method === "GET" && url.endsWith("/Projects/101/tasklist")) {
      return Response.json([])
    }
    if (method === "POST" && url.endsWith("/Projects/101/task")) {
      return Response.json(
        { id: 202, name: "foo001 — Brand push" },
        { status: 201 }
      )
    }
    return new Response("not found", { status: 404 })
  })
  const args = {
    clientId: 7,
    clientName: "Acme",
    mbaNumber: "FOO001",
    campaignName: "Brand push",
    client,
    loadLinks: async () => links.map((link) => ({ ...link })),
    saveLink: async (link: StructureLink) => {
      links.push({ ...link })
    },
  }

  assert.deepEqual(await ensureClientCampaignStructure(args), {
    ok: true,
    projectId: "101",
    taskId: "202",
  })
  const requestsAfterFirstEnsure = requestCount
  assert.deepEqual(await ensureClientCampaignStructure(args), {
    ok: true,
    projectId: "101",
    taskId: "202",
  })
  assert.equal(requestCount, requestsAfterFirstEnsure)
  assert.equal(links.length, 2)
})

test("task link unique conflict re-reads links and returns the winning task", async () => {
  const projectLink: StructureLink = {
    kind: "client_project",
    clientId: 7,
    mbaNumber: null,
    myhoursId: "101",
    myhoursName: "Acme",
  }
  let links = [projectLink]
  let loadCount = 0
  const client = createClient((url, method) => {
    if (method === "GET" && url.endsWith("/Projects/101/tasklist")) {
      return Response.json([{ id: 202, name: "foo001 — Brand push" }])
    }
    return new Response("not found", { status: 404 })
  })

  const result = await ensureClientCampaignStructure({
    clientId: 7,
    clientName: "Acme",
    mbaNumber: "FOO001",
    campaignName: "Brand push",
    client,
    loadLinks: async () => {
      loadCount += 1
      return links.map((link) => ({ ...link }))
    },
    saveLink: async (link) => {
      links = [
        projectLink,
        {
          ...link,
          myhoursId: "303",
          myhoursName: "foo001 — Brand push",
        },
      ]
      throw Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      })
    },
  })

  assert.deepEqual(result, { ok: true, projectId: "101", taskId: "303" })
  assert.equal(loadCount, 2)
})

test("non-unique link persistence failures return a failed result", async () => {
  const client = createClient((url, method) => {
    if (method === "GET" && url.endsWith("/Projects/getAll")) {
      return Response.json([{ id: 101, name: "Acme" }])
    }
    return new Response("not found", { status: 404 })
  })

  const result = await ensureClientCampaignStructure({
    clientId: 7,
    clientName: "Acme",
    mbaNumber: null,
    campaignName: null,
    client,
    loadLinks: async () => [],
    saveLink: async () => {
      throw new Error("database unavailable")
    },
  })

  assert.deepEqual(result, { ok: false, reason: "database unavailable" })
})
