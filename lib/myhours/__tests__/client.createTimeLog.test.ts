import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MYHOURS_API_BASE,
  MYHOURS_AUTH_ERROR_MESSAGE,
  MyHoursAuthError,
  MyHoursClient,
} from "../client.js"

const input = {
  date: "2026-08-12",
  duration: 3_600,
  note: "Campaign reporting",
  projectId: 101,
  taskId: 202,
  userId: 303,
}

test("createTimeLog posts the duration-based time log body", async () => {
  let request:
    | { input: RequestInfo | URL; init: RequestInit | undefined }
    | undefined
  const client = new MyHoursClient({
    getApiKey: () => "test-key",
    transport: async (requestInput, init) => {
      request = { input: requestInput, init }
      return Response.json({ id: 404, ...input }, { status: 201 })
    },
  })

  const created = await client.createTimeLog(input)

  assert.equal(String(request?.input), `${MYHOURS_API_BASE}/TimeLogs`)
  assert.equal(request?.init?.method, "POST")
  assert.deepEqual(JSON.parse(String(request?.init?.body)), input)
  assert.equal(created.id, 404)
})

test("createTimeLog fails loudly on 401 without retrying", async () => {
  let calls = 0
  const client = new MyHoursClient({
    getApiKey: () => "bad-key",
    maxRetries: 4,
    transport: async () => {
      calls += 1
      return new Response("unauthorised", { status: 401 })
    },
  })

  await assert.rejects(
    () => client.createTimeLog(input),
    (error: unknown) =>
      error instanceof MyHoursAuthError &&
      error.message === MYHOURS_AUTH_ERROR_MESSAGE
  )
  assert.equal(calls, 1)
})
