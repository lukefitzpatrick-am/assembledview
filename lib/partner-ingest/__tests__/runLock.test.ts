import assert from "node:assert/strict"
import test from "node:test"

import { runPartnerIngest } from "../runPartnerIngest"
import type { PartnerMailboxPort, PartnerMailMessage, PartnerSnowflakePort } from "../runPartnerIngest"
import {
  createInMemoryRunLock,
  createPostgresAdvisoryRunLock,
  PARTNER_INGEST_LOCK_NAME,
  type AdvisoryLockSql,
  type AdvisoryLockTx,
} from "../runLock"

function message(n: number): PartnerMailMessage {
  return {
    id: `msg-${n}`,
    internetMessageId: `<m${n}@example.com>`,
    receivedDateTime: `2026-10-1${n}T22:00:00Z`,
    senderAddress: "someone@example.com",
    subject: `Not a partner file ${n}`,
  }
}

/** Inbox whose list call waits on `gate`, so a run can be held open mid-flight. */
function inbox(gate?: Promise<void>): PartnerMailboxPort & { lists: number; moved: string[] } {
  const box = {
    lists: 0,
    moved: [] as string[],
    async listInboxMessages() {
      box.lists += 1
      if (gate) await gate
      return [message(1)]
    },
    async getAttachments() {
      return []
    },
    async moveMessage(id: string) {
      box.moved.push(id)
    },
  }
  return box
}

function store(): PartnerSnowflakePort & { logs: number; maps: number } {
  const s = {
    logs: 0,
    maps: 0,
    async loadSourceMap() {
      s.maps += 1
      return []
    },
    async hasLoadedDuplicate() {
      return false
    },
    async insertRawLines() {},
    async writeLoadAndLog() {
      s.logs += 1
    },
  }
  return s
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * Fake Postgres: transaction-scoped advisory locks shared by every client of
 * one "database", released when the transaction ends (commit or rollback).
 */
function fakeDatabase() {
  const held = new Set<string>()
  const statements: Array<{ text: string; values: unknown[] }> = []
  function client(): AdvisoryLockSql {
    return {
      async begin<T>(fn: (tx: AdvisoryLockTx) => Promise<T>): Promise<T> {
        const mine = new Set<string>()
        const tx: AdvisoryLockTx = async (strings, ...values) => {
          const text = strings.join("$")
          statements.push({ text, values })
          assert.match(text, /pg_try_advisory_xact_lock\(hashtextextended\(\$, 0\)\)/)
          const key = String(values[0])
          if (held.has(key)) return [{ acquired: false }]
          held.add(key)
          mine.add(key)
          return [{ acquired: true }]
        }
        try {
          return await fn(tx)
        } finally {
          for (const key of mine) held.delete(key)
        }
      },
    }
  }
  return { client, held, statements }
}

test("lock: a second run while the first is in flight exits at once and touches nothing", async () => {
  const lock = createInMemoryRunLock()
  const gate = deferred()
  const box1 = inbox(gate.promise)
  const store1 = store()
  const first = runPartnerIngest({ mailbox: box1, snowflake: store1, runLock: lock })
  // Let the first run reach the inbox read and park there.
  await new Promise((r) => setImmediate(r))
  assert.equal(lock.held(), true)

  const box2 = inbox()
  const store2 = store()
  const second = await runPartnerIngest({ mailbox: box2, snowflake: store2, runLock: lock })
  assert.equal(second.alreadyRunning, true)
  assert.equal(second.filesSeen, 0)
  assert.equal(second.loaded, 0)
  assert.equal(second.unrecognised, 0)
  assert.deepEqual(second.files, [])
  assert.equal(store2.maps, 0, "second run must not read the source map")
  assert.equal(box2.lists, 0, "second run must not read the inbox")
  assert.equal(store2.logs, 0, "second run must not write a log row")
  assert.deepEqual(box2.moved, [])

  gate.resolve()
  const done = await first
  assert.equal(done.alreadyRunning, undefined)
  assert.equal(done.unrecognised, 1)
  assert.deepEqual(box1.moved, ["msg-1"])
  assert.equal(lock.held(), false)
})

test("lock: released after a run finishes, so the next run goes ahead", async () => {
  const lock = createInMemoryRunLock()
  const a = await runPartnerIngest({ mailbox: inbox(), snowflake: store(), runLock: lock })
  const b = await runPartnerIngest({ mailbox: inbox(), snowflake: store(), runLock: lock })
  assert.equal(a.alreadyRunning, undefined)
  assert.equal(b.alreadyRunning, undefined)
  assert.equal(b.unrecognised, 1)
})

test("lock: released when a run throws", async () => {
  const lock = createInMemoryRunLock()
  const failing = store()
  failing.loadSourceMap = async () => {
    throw new Error("snowflake down")
  }
  await assert.rejects(
    runPartnerIngest({ mailbox: inbox(), snowflake: failing, runLock: lock }),
    /snowflake down/
  )
  assert.equal(lock.held(), false)
  const next = await runPartnerIngest({ mailbox: inbox(), snowflake: store(), runLock: lock })
  assert.equal(next.alreadyRunning, undefined)
})

test("lock: no runLock keeps the old behaviour", async () => {
  const summary = await runPartnerIngest({ mailbox: inbox(), snowflake: store() })
  assert.equal(summary.alreadyRunning, undefined)
  assert.equal(summary.unrecognised, 1)
})

test("postgres lock: two clients overlap, the second is refused, then the lock frees at commit", async () => {
  const db = fakeDatabase()
  const lockA = createPostgresAdvisoryRunLock(db.client())
  const lockB = createPostgresAdvisoryRunLock(db.client())
  const gate = deferred()
  const box1 = inbox(gate.promise)
  const first = runPartnerIngest({ mailbox: box1, snowflake: store(), runLock: lockA })
  await new Promise((r) => setImmediate(r))
  assert.deepEqual([...db.held], [PARTNER_INGEST_LOCK_NAME])

  const box2 = inbox()
  const second = await runPartnerIngest({ mailbox: box2, snowflake: store(), runLock: lockB })
  assert.equal(second.alreadyRunning, true)
  assert.equal(box2.lists, 0)

  gate.resolve()
  const done = await first
  assert.equal(done.unrecognised, 1)
  assert.equal(db.held.size, 0, "lock released when the transaction ends")

  const third = await runPartnerIngest({ mailbox: inbox(), snowflake: store(), runLock: lockB })
  assert.equal(third.alreadyRunning, undefined)
  assert.equal(third.unrecognised, 1)
})

test("postgres lock: one statement, the lock name as a bound parameter", async () => {
  const db = fakeDatabase()
  const lock = createPostgresAdvisoryRunLock(db.client())
  const result = await lock.runExclusive(async () => 42)
  assert.deepEqual(result, { acquired: true, value: 42 })
  assert.equal(db.statements.length, 1)
  assert.deepEqual(db.statements[0]!.values, [PARTNER_INGEST_LOCK_NAME])
  assert.match(db.statements[0]!.text, /^select pg_try_advisory_xact_lock\(hashtextextended\(\$, 0\)\) as acquired$/)
})

test("postgres lock: not acquired never calls the run", async () => {
  const sql: AdvisoryLockSql = {
    async begin<T>(fn: (tx: AdvisoryLockTx) => Promise<T>): Promise<T> {
      return fn(async () => [{ acquired: false }])
    },
  }
  let called = false
  const result = await createPostgresAdvisoryRunLock(sql).runExclusive(async () => {
    called = true
    return 1
  })
  assert.deepEqual(result, { acquired: false })
  assert.equal(called, false)
})

test("postgres lock: a database error rejects and does not run (fails closed)", async () => {
  const sql: AdvisoryLockSql = {
    async begin<T>(): Promise<T> {
      throw new Error("connect ECONNREFUSED")
    },
  }
  let called = false
  await assert.rejects(
    createPostgresAdvisoryRunLock(sql).runExclusive(async () => {
      called = true
      return 1
    }),
    /ECONNREFUSED/
  )
  assert.equal(called, false)
})

test("postgres lock: a run error propagates out of the transaction", async () => {
  const db = fakeDatabase()
  await assert.rejects(
    createPostgresAdvisoryRunLock(db.client()).runExclusive(async () => {
      throw new Error("graph 503")
    }),
    /graph 503/
  )
  assert.equal(db.held.size, 0)
})
