/**
 * T0-10 / T0-3 — unique SOW match must resolve an existing open exception.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import { xeroArInvoices, xeroSyncExceptions } from "@/db/schema/ported"

const skip = mockModuleSkip()

type UpdateCall = { table: unknown; set: Record<string, unknown> | undefined }
type InsertCall = { table: unknown; values: unknown }

const updates: UpdateCall[] = []
const inserts: InsertCall[] = []
let selectCount = 0

function resetDbCalls(): void {
  updates.length = 0
  inserts.length = 0
  selectCount = 0
}

const fakeDb = {
  update(table: unknown) {
    const rec: UpdateCall = { table, set: undefined }
    updates.push(rec)
    return {
      set(row: Record<string, unknown>) {
        rec.set = row
        return {
          where() {
            return Promise.resolve([])
          },
        }
      },
    }
  },
  insert(table: unknown) {
    const rec: InsertCall = { table, values: undefined }
    inserts.push(rec)
    return {
      values(row: unknown) {
        rec.values = row
        return Promise.resolve([])
      },
    }
  },
  select() {
    selectCount += 1
    return {
      from() {
        return {
          where() {
            return {
              limit() {
                return Promise.resolve([])
              },
            }
          },
        }
      },
    }
  },
}

if (supportsMockModule()) {
  await mock.module!("@/db", {
    namedExports: { db: fakeDb },
  })
}

const applyMatchMba = supportsMockModule()
  ? (await import("../applyMatchMba")).applyMatchMba
  : null

const LEGAL_REF = "legalsuper - SEO Retainer (legal_sow001)"
const SCOPES = [{ id: 101, scope_id: "legal_sow001" }]
const MASTERS: { id: number; mba_number: string }[] = []

const SOW_INPUT = {
  arInvoiceId: 77,
  referenceRaw: LEGAL_REF,
  xeroInvoiceId: "xero-inv-legal-sow",
  invoiceNumber: "INV-SOW-1",
  issueDate: "2026-08-01",
}

function exceptionResolves(): UpdateCall[] {
  return updates.filter(
    (u) =>
      u.table === xeroSyncExceptions &&
      u.set?.resolved === true,
  )
}

function arMbaWrites(): UpdateCall[] {
  return updates.filter(
    (u) => u.table === xeroArInvoices && Object.prototype.hasOwnProperty.call(u.set ?? {}, "mbaNumber"),
  )
}

test(
  "SOW match resolves an existing open exception and writes no mba_number",
  { skip },
  async () => {
    resetDbCalls()
    const result = await applyMatchMba!(SOW_INPUT, MASTERS, SCOPES)
    assert.equal(result.matched, true)
    if (result.matched) assert.equal(result.kind, "sow")

    const resolved = exceptionResolves()
    assert.equal(resolved.length, 1, "must UPDATE xero_sync_exceptions to resolved")
    assert.equal(resolved[0]!.set?.resolved, true)
    assert.match(String(resolved[0]!.set?.reason ?? ""), /auto-matched \(ref: legalsuper/)

    assert.equal(arMbaWrites().length, 0, "scope is not an MBA — do not write mba_number")
    assert.equal(inserts.length, 0, "must not insert a new exception")
  },
)

test(
  "SOW match with no existing exception is a no-op besides the resolve UPDATE",
  { skip },
  async () => {
    resetDbCalls()
    const result = await applyMatchMba!(SOW_INPUT, MASTERS, SCOPES)
    assert.equal(result.matched, true)
    if (result.matched) assert.equal(result.kind, "sow")

    assert.equal(inserts.length, 0, "must not insert a new exception when none exists")
    assert.equal(selectCount, 0, "must not go through upsertOpenException")
    assert.equal(arMbaWrites().length, 0)
    assert.equal(exceptionResolves().length, 1)
  },
)
