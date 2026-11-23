/**
 * S4 (F4): deleteClientFeeRateChange removes a change only when it belongs to
 * the client in the URL. getDb is mocked; the where clause it receives is
 * compiled to SQL and must bind both the change id and the client id. The
 * route tests mock this module, so this is the pin on the tenant filter.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"

import * as schema from "@/db/schema"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"

const skip = mockModuleSkip()

let captured: SQL | undefined
let returned: Array<{ id: number }> = []
const getDb = mock.fn(() => ({
  delete: () => ({
    where: (where: SQL) => {
      captured = where
      return { returning: async () => returned }
    },
  }),
}))

if (supportsMockModule()) {
  await mock.module!("@/db", { namedExports: { getDb, schema } })
}

const data = supportsMockModule() ? await import("../clientFeeRates") : null

test("delete binds the change id AND the client id in its where clause", { skip }, async () => {
  assert.ok(data)
  returned = [{ id: 41 }]
  assert.equal(await data.deleteClientFeeRateChange(58, 41), true)
  assert.ok(captured)
  const q = new PgDialect().sqlToQuery(captured)
  assert.match(q.sql, /"client_fee_rates"\."id" = \$\d/)
  assert.match(q.sql, /"client_fee_rates"\."client_id" = \$\d/)
  assert.match(q.sql, / and /)
  assert.deepEqual([...q.params].sort(), [41, 58])
})

test("no row back (another client's change, or gone) is false", { skip }, async () => {
  assert.ok(data)
  returned = []
  assert.equal(await data.deleteClientFeeRateChange(58, 99), false)
})
