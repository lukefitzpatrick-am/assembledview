import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sql } from "drizzle-orm"

import { closeDb, getDb } from "@/db"
import { loadEnvLocal } from "../../../scripts/migration/_shared.js"
import { rowsOf } from "../dbRows"
import {
  applyContactLinkUpsert,
  upsertXeroContactLink,
  type ContactLinkStoreRow,
} from "../contactLinks"

loadEnvLocal()

const hasDb = Boolean(process.env.DATABASE_URL?.trim())

describe("applyContactLinkUpsert", () => {
  it("inserts a first assign and updates a second assign for the same contact", () => {
    const first: ContactLinkStoreRow = {
      xeroContactKey: "xero-contact-1",
      clientId: 10,
      learnedFrom: "assign_client",
    }
    const afterFirst = applyContactLinkUpsert([], first)
    assert.equal(afterFirst.length, 1)
    assert.equal(afterFirst[0]?.clientId, 10)

    const afterSecond = applyContactLinkUpsert(afterFirst, {
      xeroContactKey: "xero-contact-1",
      clientId: 22,
      learnedFrom: "assign_client",
    })
    assert.equal(afterSecond.length, 1)
    assert.equal(afterSecond[0]?.clientId, 22)
    assert.equal(afterSecond[0]?.xeroContactKey, "xero-contact-1")
  })
})

describe("upsertXeroContactLink postgres", {
  skip: hasDb ? false : "DATABASE_URL unset",
}, () => {
  it("assign_client writes the link, and a second assign updates rather than duplicating", async () => {
    const db = getDb()
    const key = `cb1-test-${process.pid}-${Date.now()}`
    try {
      const clients = rowsOf<{ id: number }>(
        await db.execute(sql`SELECT id FROM clients ORDER BY id ASC LIMIT 2`),
      ).map((r) => Number(r.id))
      if (clients.length < 2) {
        throw new Error("need at least two clients to prove ON CONFLICT update")
      }
      const [firstId, secondId] = clients as [number, number]

      await upsertXeroContactLink({
        xeroContactKey: key,
        clientId: firstId,
        learnedFrom: "assign_client",
      })
      await upsertXeroContactLink({
        xeroContactKey: key,
        clientId: secondId,
        learnedFrom: "assign_client",
      })

      const rows = rowsOf<{ client_id: number }>(
        await db.execute(sql`
          SELECT client_id
          FROM xero_contact_links
          WHERE xero_contact_key = ${key}
        `),
      )
      assert.equal(rows.length, 1)
      assert.equal(Number(rows[0]?.client_id), secondId)
    } finally {
      await db.execute(
        sql`DELETE FROM xero_contact_links WHERE xero_contact_key = ${key}`,
      )
      await closeDb()
    }
  })
})
