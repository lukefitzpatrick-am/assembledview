import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assignMbaAndResolveException,
  listOpenXeroExceptions,
} from "@/lib/finance/xeroQueue"

function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks
  if (!chunks) return String(query)
  const parts: string[] = []
  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      parts.push(chunk)
      continue
    }
    if (chunk && typeof chunk === "object" && "value" in chunk) {
      const value = (chunk as { value: unknown }).value
      if (Array.isArray(value)) parts.push(value.map((part) => String(part)).join(""))
      else if (typeof value === "string") parts.push(value)
    }
  }
  return parts.join(" ")
}

test("listOpenXeroExceptions reads open Postgres exceptions newest first", async () => {
  const queries: string[] = []
  const rows = await listOpenXeroExceptions({
    async execute(query) {
      queries.push(sqlText(query))
      return {
        rows: [
          {
            id: 4,
            xero_invoice_id: "inv-4",
            invoice_number: "INV-4",
            reference: "PO-4",
            reason: "no mba",
            issue_date: "2025-08-01",
            created_at: "2025-08-02T00:00:00.000Z",
            resolved: false,
            contact_name: "Acme",
            amount: "110.00",
            sub_total: "100.00",
          },
        ],
      }
    },
  })

  assert.equal(queries.length, 1)
  assert.match(queries[0], /FROM xero_sync_exceptions/)
  assert.match(queries[0], /xero_ar_invoices/)
  assert.match(queries[0], /xero_contacts/)
  assert.match(queries[0], /resolved IS NOT TRUE/)
  assert.match(queries[0], /ORDER BY e.created_at DESC/)
  assert.equal(rows[0]?.invoice_number, "INV-4")
  assert.equal(rows[0]?.contact_name, "Acme")
  assert.equal(rows[0]?.amount, "110.00")
  assert.equal(rows[0]?.reference, "PO-4")
})

test("assign_mba writes the invoice and resolves the exception, and rolls both back on error", async () => {
  const attempted: string[] = []
  let committed = false

  const db = {
    async transaction<T>(fn: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<T>) {
      const tx = {
        async execute(query: unknown) {
          const text = sqlText(query)
          attempted.push(text)
          if (text.includes("FROM media_plan_masters")) {
            return { rows: [{ id: 7, mba_number: "MBA100" }] }
          }
          if (text.includes("FROM xero_sync_exceptions")) {
            return { rows: [{ id: 3, xero_invoice_id: "inv-1" }] }
          }
          if (text.includes("UPDATE xero_ar_invoices")) {
            return { rows: [{ id: 9 }] }
          }
          if (text.includes("UPDATE xero_sync_exceptions")) {
            throw new Error("resolve failed")
          }
          return { rows: [] }
        },
      }
      try {
        const result = await fn(tx)
        committed = true
        return result
      } catch (err) {
        committed = false
        throw err
      }
    },
  }

  await assert.rejects(
    () =>
      assignMbaAndResolveException(
        { id: 3, mbaNumber: "mba100", resolvedBy: "luke@assembledmedia.com.au" },
        db
      ),
    /resolve failed/
  )

  assert.equal(committed, false)
  assert.ok(attempted.some((sql) => sql.includes("UPDATE xero_ar_invoices")))
  assert.ok(attempted.some((sql) => sql.includes("UPDATE xero_sync_exceptions")))
  assert.ok(
    attempted.findIndex((sql) => sql.includes("UPDATE xero_ar_invoices")) <
      attempted.findIndex((sql) => sql.includes("UPDATE xero_sync_exceptions"))
  )
})
