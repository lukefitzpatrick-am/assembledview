import assert from "node:assert/strict"
import test from "node:test"

import {
  AccountsNotifyUnsetError,
  AccountsPackEmailError,
  buildBillingPackCsv,
  previewAccountsPack,
  runSendToAccounts,
  type AccountsPackRow,
  type SendToAccountsDeps,
} from "../sendToAccounts.js"

function row(partial: Partial<AccountsPackRow> = {}): AccountsPackRow {
  return {
    invoiceKey: "media:BIC001:2026-07",
    persistedId: 11,
    clientsId: 4,
    clientName: "BIC",
    mbaNumber: "BIC001",
    campaignName: "Winter",
    billingType: "media",
    status: "booked",
    billingMonth: "2026-07",
    total: 1000,
    blockers: [],
    ...partial,
  }
}

function deps(overrides: Partial<SendToAccountsDeps> = {}): SendToAccountsDeps & {
  calls: { store: number; email: number; commit: number }
} {
  const calls = { store: 0, email: 0, commit: 0 }
  return {
    accountsEmail: "accounts@example.com",
    financeEmail: "finance@example.com",
    now: () => new Date("2026-07-15T01:02:03.000Z"),
    calls,
    buildWorkbook: async () => Buffer.from("xlsx"),
    store: async () => {
      calls.store += 1
      return {
        csv: "finance-exports/2026/2026-07/20260715T010203Z-csv",
        xlsx: "finance-exports/2026/2026-07/20260715T010203Z-xlsx",
      }
    },
    sendEmail: async () => {
      calls.email += 1
    },
    commit: async () => {
      calls.commit += 1
    },
    ...overrides,
  }
}

test("preview totals group approved rows by type", () => {
  const preview = previewAccountsPack("2026-07", [
    row({ total: 1000, billingType: "media" }),
    row({
      invoiceKey: "sow:SC1:2026-07",
      billingType: "sow",
      total: 250.5,
      mbaNumber: "SC1",
      blockers: ["legal name missing"],
    }),
    row({
      invoiceKey: "retainer:4:2026-07",
      billingType: "retainer",
      total: 400,
      blockers: ["no Xero contact link"],
    }),
  ])
  assert.equal(preview.monthLabel, "July 2026")
  assert.equal(preview.invoiceCount, 3)
  assert.equal(preview.totalExGst, 1650.5)
  assert.deepEqual(preview.totalsByType.media, { count: 1, total: 1000 })
  assert.deepEqual(preview.totalsByType.sow, { count: 1, total: 250.5 })
  assert.deepEqual(preview.totalsByType.retainer, { count: 1, total: 400 })
  assert.equal(preview.blockers.length, 2)
  assert.match(buildBillingPackCsv(preview.rows), /^client_name,mba_number,campaign_name,billing_type,status,billing_month,total/)
})

test("commit writes the blob path only after email succeeds", async () => {
  const committed: { blobPath: string; rows: number } = { blobPath: "", rows: 0 }
  const harness = deps({
    commit: async (input) => {
      harness.calls.commit += 1
      committed.blobPath = input.blobPath
      committed.rows = input.rows.length
    },
  })
  const result = await runSendToAccounts({
    fy: 2026,
    month: "2026-07",
    rows: [row(), row({ invoiceKey: "sow:SC1:2026-07", billingType: "sow", total: 10 })],
    exportedBy: 7,
    deps: harness,
  })
  assert.equal(result.sent, 2)
  assert.equal(harness.calls.store, 1)
  assert.equal(harness.calls.email, 1)
  assert.equal(harness.calls.commit, 1)
  assert.match(committed.blobPath, /"csv":"finance-exports\/2026\/2026-07\/20260715T010203Z-csv"/)
  assert.match(committed.blobPath, /"xlsx":/)
})

test("email failure writes no stamp, audit, or blob path", async () => {
  const harness = deps({
    sendEmail: async () => {
      harness.calls.email += 1
      throw new Error("graph down")
    },
  })
  await assert.rejects(
    () =>
      runSendToAccounts({
        fy: 2026,
        month: "2026-07",
        rows: [row()],
        exportedBy: 7,
        deps: harness,
      }),
    (error: unknown) => error instanceof AccountsPackEmailError
  )
  assert.equal(harness.calls.commit, 0)
})

test("unset ACCOUNTS_NOTIFY_EMAIL is 409 and writes nothing", async () => {
  const harness = deps({ accountsEmail: "  " })
  await assert.rejects(
    () =>
      runSendToAccounts({
        fy: 2026,
        month: "2026-07",
        rows: [row()],
        exportedBy: 7,
        deps: harness,
      }),
    (error: unknown) => error instanceof AccountsNotifyUnsetError && error.status === 409
  )
  assert.equal(harness.calls.store, 0)
  assert.equal(harness.calls.email, 0)
  assert.equal(harness.calls.commit, 0)
})
