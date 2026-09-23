/**
 * Finance edit POST inserts a finance_edits row.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { NextRequest } from "next/server"

import { schema as realSchema } from "@/db"
import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = []

const requireFinanceAdminMock = mock.fn(async () => ({
  session: { user: { email: "luke@assembledmedia.com.au" } },
}))

const getDbMock = () => ({
  insert(table: unknown) {
    return {
      values(values: Record<string, unknown>) {
        return {
          returning: async () => {
            inserted.push({ table, values })
            return [
              {
                id: 42,
                fieldName: values.fieldName,
                recordType: values.recordType,
                newValue: values.newValue,
                editType: values.editType,
                editStatus: values.editStatus,
                editedByName: values.editedByName,
              },
            ]
          },
        }
      },
    }
  },
})

if (typeof mock.module === "function") {
  await mock.module("@/lib/requireRole", {
    namedExports: { requireFinanceAdmin: requireFinanceAdminMock },
  })
  await mock.module("@/db", {
    namedExports: {
      schema: realSchema,
      getDb: getDbMock,
    },
  })
}

const { POST } = await import("../route")

test(
  "POST /api/finance/edits inserts a finance_edits row",
  { skip },
  async () => {
    inserted.length = 0
    const request = new NextRequest("http://localhost/api/finance/edits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        record_type: "accrual_reconcile",
        edit_type: "field_change",
        field_name: "accrual:1:2025-07",
        new_value: "1",
        old_value: null,
        edit_status: "published",
        finance_billing_records_id: null,
        finance_billing_line_items_id: null,
      }),
    })

    const response = await POST(request)
    assert.equal(response.status, 201)
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0]?.table, realSchema.financeEdits)
    assert.equal(inserted[0]?.values.recordType, "accrual_reconcile")
    assert.equal(inserted[0]?.values.fieldName, "accrual:1:2025-07")
    assert.equal(inserted[0]?.values.newValue, "1")
    assert.equal(inserted[0]?.values.editStatus, "published")

    const body = (await response.json()) as { record_type?: string; field_name?: string }
    assert.equal(body.record_type, "accrual_reconcile")
    assert.equal(body.field_name, "accrual:1:2025-07")
  }
)
