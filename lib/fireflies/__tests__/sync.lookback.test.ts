import assert from "node:assert/strict"
import { test } from "node:test"

import { runFirefliesSync } from "../sync.js"
import { DEFAULT_SYNC_LOOKBACK_DAYS } from "../lookback.js"

test("null cursor uses the default lookback fromDate", async () => {
  let seen: string | null = null

  await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => null,
    saveRun: async () => {},
    hasMeeting: async () => false,
    insertNote: async () => ({ id: 1 }),
    loadAttributionContext: async () => ({
      knownMbas: new Map(),
      domainToClient: new Map(),
      assembledDomains: new Set(["assembledmedia.com.au"]),
      titleClients: [],
    }),
    listTranscripts: async (fromDate) => {
      seen = fromDate
      return []
    },
  })

  assert.ok(seen)
  const ageDays = (Date.now() - Date.parse(seen!)) / 86_400_000
  assert.ok(
    ageDays > DEFAULT_SYNC_LOOKBACK_DAYS - 1 &&
      ageDays < DEFAULT_SYNC_LOOKBACK_DAYS + 1,
    `expected ~${DEFAULT_SYNC_LOOKBACK_DAYS}d lookback, got ${ageDays}`
  )
})

test("stored cursor is used as fromDate (no lookback override)", async () => {
  let seen: string | null = null
  const cursor = "2026-07-01T00:00:00.000Z"

  await runFirefliesSync({
    getApiKey: () => "test-key",
    loadCursor: async () => cursor,
    saveRun: async () => {},
    hasMeeting: async () => false,
    insertNote: async () => ({ id: 1 }),
    loadAttributionContext: async () => ({
      knownMbas: new Map(),
      domainToClient: new Map(),
      assembledDomains: new Set(["assembledmedia.com.au"]),
      titleClients: [],
    }),
    listTranscripts: async (fromDate) => {
      seen = fromDate
      return []
    },
  })

  assert.equal(seen, cursor)
})
