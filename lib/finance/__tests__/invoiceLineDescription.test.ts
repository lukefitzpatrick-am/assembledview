import assert from "node:assert/strict"
import test from "node:test"
import {
  billingMonthKeyLabel,
  billingMonthLabel,
  retainerInvoiceDescription,
  retainerInvoiceDescriptionForMonthKey,
  scopeInvoiceDescription,
} from "../invoiceLineDescription.js"
import { extractLineItemsFromScopeSchedule } from "../scopeScheduleExtract.js"
import { deriveSowBillingRecordsFromScopes } from "../deriveScopeSowReceivables.js"
import { deriveRetainerBillingRecordsForMonth } from "../deriveRetainerReceivables.js"

test("billingMonthLabel: fixed English month names, no locale or time zone", () => {
  assert.equal(billingMonthLabel(2026, 10), "October 2026")
  assert.equal(billingMonthLabel(2026, 1), "January 2026")
  assert.equal(billingMonthLabel(2026, 13), "")
  assert.equal(billingMonthKeyLabel("2026-09"), "September 2026")
  assert.equal(billingMonthKeyLabel("Sep 2026"), "")
})

test("scopeInvoiceDescription: project name plus month and year", () => {
  assert.equal(scopeInvoiceDescription("SEO retainer", 2026, 10), "SEO retainer, October 2026")
  assert.equal(scopeInvoiceDescription("  ", 2026, 10), "Scope of Work, October 2026")
  assert.equal(scopeInvoiceDescription(null, 2026, 10), "Scope of Work, October 2026")
})

test("retainerInvoiceDescription: Monthly retainer plus month and year", () => {
  assert.equal(retainerInvoiceDescription(2026, 10), "Monthly retainer, October 2026")
  assert.equal(retainerInvoiceDescriptionForMonthKey("2026-10"), "Monthly retainer, October 2026")
  assert.equal(retainerInvoiceDescriptionForMonthKey(""), "Monthly retainer")
})

test("extractLineItemsFromScopeSchedule: flat row uses the project name, not the month string", () => {
  const schedule = [{ month: "2026-09", cost: 2750 }, { month: "2026-10", cost: 2750 }]
  const [line] = extractLineItemsFromScopeSchedule(schedule, 2026, 10, { projectName: "SEO Retainer" })
  assert.equal(line.description, "SEO Retainer, October 2026")
  assert.equal(line.amount, 2750)
  const [noName] = extractLineItemsFromScopeSchedule(schedule, 2026, 9)
  assert.equal(noName.description, "Scope of Work, September 2026")
})

test("deriveSowBillingRecordsFromScopes: sow row line description follows project_name; key still scope_id", () => {
  const records = deriveSowBillingRecordsFromScopes(
    [
      {
        id: 9,
        scope_id: "legal_sow001",
        client_name: "legalsuper",
        project_name: "SEO Retainer",
        project_status: "In-Progress",
        billing_schedule: [{ month: "2026-10", cost: 2750 }],
      },
    ],
    2026,
    10,
    () => 1,
    { includeNonApprovedScopes: false }
  )
  assert.equal(records.length, 1)
  assert.equal(records[0].mba_number, "legal_sow001")
  assert.equal(records[0].line_items[0].description, "SEO Retainer, October 2026")
})

test("deriveRetainerBillingRecordsForMonth: line description names the month", () => {
  const [r] = deriveRetainerBillingRecordsForMonth(
    [{ id: 7, clientname_input: "Client A", monthlyretainer: 3000 }],
    2026,
    10
  )
  assert.equal(r.line_items[0].description, "Monthly retainer, October 2026")
})
