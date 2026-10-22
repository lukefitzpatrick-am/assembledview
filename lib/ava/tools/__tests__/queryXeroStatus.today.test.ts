import assert from "node:assert/strict"
import { test } from "node:test"

import { xeroOverdueToday } from "../queryXeroStatus"

test("C8: Xero overdue cut-off is the Melbourne day, not the UTC day", () => {
  // 21 Oct 23:30 UTC is 22 Oct 10:30 AEDT. An invoice due 21 Oct is overdue.
  assert.equal(xeroOverdueToday(new Date("2026-10-21T23:30:00Z")), "2026-10-22")
  // 22 Oct 12:59 UTC is 22 Oct 23:59 AEDT.
  assert.equal(xeroOverdueToday(new Date("2026-10-22T12:59:00Z")), "2026-10-22")
  // 22 Oct 13:00 UTC is 23 Oct 00:00 AEDT.
  assert.equal(xeroOverdueToday(new Date("2026-10-22T13:00:00Z")), "2026-10-23")
  // Winter (AEST, UTC+10): 30 Jun 14:00 UTC is 1 Jul 00:00.
  assert.equal(xeroOverdueToday(new Date("2026-06-30T14:00:00Z")), "2026-07-01")
})
