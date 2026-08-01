import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveInvoicingVisibleMonthGroups } from "../useInvoicingReceivablesData"
import type { MonthGroup } from "@/lib/finance/useReceivablesData"

function mg(monthIso: string): MonthGroup {
  return { monthIso, monthLabel: monthIso, clients: [], total: 100 }
}

test("while updating, keep prior months even when new range has no overlap", () => {
  const groups = [mg("2025-07"), mg("2025-08")]
  const visible = resolveInvoicingVisibleMonthGroups(
    groups,
    { from: "2026-01", to: "2026-01" },
    true
  )
  assert.equal(visible.length, 2)
  assert.equal(visible[0]!.monthIso, "2025-07")
})

test("when settled, clamp to applied month range", () => {
  const groups = [mg("2025-07"), mg("2025-08"), mg("2025-09")]
  const visible = resolveInvoicingVisibleMonthGroups(
    groups,
    { from: "2025-08", to: "2025-08" },
    false
  )
  assert.equal(visible.length, 1)
  assert.equal(visible[0]!.monthIso, "2025-08")
})
